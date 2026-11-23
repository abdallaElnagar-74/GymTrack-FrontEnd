import type { SQLiteDatabase } from 'expo-sqlite';
import { SYNC_TABLES, type SyncTable } from '../db/schema';
import { ApiError, apiRequest, normalizeUrl } from './api';

/**
 * Offline-first sync with the Node backend.
 *
 * Local rows carry `uuid` (global id), `updated_at` and `dirty`, maintained by SQLite
 * triggers (see schema.ts). A sync = pull server changes since `last_version` and merge
 * them (last-write-wins on updated_at), then push every dirty row + tombstone.
 * Rows reference each other by uuid on the wire and by local integer id on the phone.
 */

export type SyncMeta = {
  applying: number;
  last_version: number;
  last_sync_at: number | null;
  api_url: string;
  token: string;
  email: string;
};

type Row = Record<string, any>;

/** Wire format per table: data columns and which of them reference another table. */
const WIRE: Record<SyncTable, { cols: string[]; refs: Record<string, SyncTable> }> = {
  exercises: { cols: ['name', 'muscle_group', 'created_at'], refs: {} },
  exercise_videos: {
    cols: ['exercise_id', 'source', 'url', 'title', 'position', 'created_at'],
    refs: { exercise_id: 'exercises' },
  },
  routines: { cols: ['name', 'created_at'], refs: {} },
  routine_days: { cols: ['routine_id', 'name', 'position'], refs: { routine_id: 'routines' } },
  routine_day_exercises: {
    cols: ['day_id', 'exercise_id', 'position', 'target_sets'],
    refs: { day_id: 'routine_days', exercise_id: 'exercises' },
  },
  workouts: { cols: ['date', 'notes', 'finished_at', 'title', 'day_id'], refs: { day_id: 'routine_days' } },
  workout_sets: {
    cols: ['workout_id', 'exercise_id', 'set_number', 'reps', 'weight_kg', 'created_at', 'done', 'kind'],
    refs: { workout_id: 'workouts', exercise_id: 'exercises' },
  },
};

/** References that may be empty (all others are required locally). */
const OPTIONAL_REFS = new Set(['workouts.day_id']);

export async function getSyncMeta(db: SQLiteDatabase): Promise<SyncMeta> {
  const m = await db.getFirstAsync<SyncMeta>('SELECT * FROM sync_meta WHERE id = 1');
  return m ?? { applying: 0, last_version: 0, last_sync_at: null, api_url: '', token: '', email: '' };
}

async function setApplying(db: SQLiteDatabase, on: boolean) {
  await db.runAsync('UPDATE sync_meta SET applying = ? WHERE id = 1', on ? 1 : 0);
}

// ---------- Account ----------

type AuthResponse = { token: string; user: { id: string; email: string } };

export async function signIn(
  db: SQLiteDatabase,
  apiUrl: string,
  email: string,
  password: string,
  mode: 'login' | 'register'
) {
  const url = normalizeUrl(apiUrl);
  const res = await apiRequest<AuthResponse>(url, `/auth/${mode}`, { method: 'POST', body: { email, password } });
  // New session: start from scratch so this phone's data merges into the account.
  await setApplying(db, true);
  try {
    await db.withTransactionAsync(async () => {
      for (const t of SYNC_TABLES) await db.runAsync(`UPDATE ${t} SET dirty = 1`);
      await db.runAsync(
        'UPDATE sync_meta SET api_url = ?, token = ?, email = ?, last_version = 0, last_sync_at = NULL WHERE id = 1',
        url,
        res.token,
        res.user.email
      );
    });
  } finally {
    await setApplying(db, false);
  }
}

export async function signOut(db: SQLiteDatabase) {
  await db.runAsync("UPDATE sync_meta SET token = '', email = '', last_version = 0, last_sync_at = NULL WHERE id = 1");
}

export async function checkServer(apiUrl: string) {
  await apiRequest(apiUrl, '/health', { timeoutMs: 8000 });
}

// ---------- Sync ----------

let running: Promise<SyncResult> | null = null;

export type SyncResult = { pulled: number; pushed: number };

/** Run a sync (concurrent calls share the same run). Throws ApiError on failure. */
export function syncNow(db: SQLiteDatabase): Promise<SyncResult> {
  if (!running) {
    running = doSync(db).finally(() => {
      running = null;
    });
  }
  return running;
}

async function doSync(db: SQLiteDatabase): Promise<SyncResult> {
  const meta = await getSyncMeta(db);
  if (!meta.token || !meta.api_url) return { pulled: 0, pushed: 0 };
  const opts = { token: meta.token };

  try {
    // 1) Pull
    let since = meta.last_version;
    let pulled = 0;
    for (let page = 0; page < 100; page++) {
      const res = await apiRequest<{ changes: Record<SyncTable, Row[]>; version: number; hasMore: boolean }>(
        meta.api_url,
        `/sync/pull?since=${since}`,
        opts
      );
      pulled += await applyRemote(db, res.changes);
      since = res.version;
      await db.runAsync('UPDATE sync_meta SET last_version = ? WHERE id = 1', since);
      if (!res.hasMore) break;
    }

    // 2) Push
    const pushed = await pushLocal(db, meta.api_url, meta.token);
    await db.runAsync('UPDATE sync_meta SET last_sync_at = ? WHERE id = 1', Date.now());
    return { pulled, pushed };
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      await signOut(db);
      throw new ApiError(401, 'Your session expired. Please sign in again.');
    }
    throw e;
  }
}

async function localIdByUuid(db: SQLiteDatabase, table: SyncTable, uuid: string) {
  const r = await db.getFirstAsync<{ id: number }>(`SELECT id FROM ${table} WHERE uuid = ?`, uuid);
  return r?.id ?? null;
}

/** Merge server rows into the local DB. Returns how many rows changed locally. */
async function applyRemote(db: SQLiteDatabase, changes: Record<SyncTable, Row[]>) {
  let count = 0;
  await setApplying(db, true);
  try {
    await db.withTransactionAsync(async () => {
      for (const t of SYNC_TABLES) {
        for (const row of changes[t] ?? []) {
          try {
            if (await applyRow(db, t, row)) count++;
          } catch (e) {
            // e.g. a UNIQUE(name) clash — skip this row rather than blocking the whole sync.
            console.warn(`sync: skipped ${t} ${row.id}`, e);
          }
        }
      }
    });
  } finally {
    await setApplying(db, false);
  }
  return count;
}

async function applyRow(db: SQLiteDatabase, t: SyncTable, row: Row): Promise<boolean> {
  const local = await db.getFirstAsync<{ id: number; updated_at: number }>(
    `SELECT id, updated_at FROM ${t} WHERE uuid = ?`,
    row.id
  );
  // Last write wins: keep the local row if it was edited more recently.
  if (local && local.updated_at > row.updated_at) return false;

  if (row.deleted) {
    if (!local) return false;
    await db.runAsync(`DELETE FROM ${t} WHERE id = ?`, local.id);
    return true;
  }

  // Translate references (uuid -> local id).
  const { cols, refs } = WIRE[t];
  const values: Record<string, unknown> = {};
  for (const c of cols) {
    const target = refs[c];
    if (!target) {
      values[c] = row[c] ?? null;
      continue;
    }
    const id = row[c] ? await localIdByUuid(db, target, row[c]) : null;
    if (id == null && !OPTIONAL_REFS.has(`${t}.${c}`)) return false; // parent missing locally
    values[c] = id;
  }
  if (t === 'workouts') values.notes ??= '';

  if (local) {
    const set = cols.map((c) => `${c} = ?`).join(', ');
    await db.runAsync(
      `UPDATE ${t} SET ${set}, updated_at = ?, dirty = 0 WHERE id = ?`,
      ...cols.map((c) => values[c] as any),
      row.updated_at,
      local.id
    );
    return true;
  }

  // Same exercise name created on two devices: merge into one row instead of failing UNIQUE(name).
  if (t === 'exercises') {
    const same = await db.getFirstAsync<{ id: number; updated_at: number }>(
      'SELECT id, updated_at FROM exercises WHERE name = ? COLLATE NOCASE',
      values.name as string
    );
    if (same) {
      await db.runAsync(
        'UPDATE exercises SET uuid = ?, muscle_group = ?, updated_at = ?, dirty = 0 WHERE id = ?',
        row.id,
        values.muscle_group as string,
        row.updated_at,
        same.id
      );
      return true;
    }
  }

  await db.runAsync(
    `INSERT INTO ${t} (uuid, ${cols.join(', ')}, updated_at, dirty) VALUES (?, ${cols.map(() => '?').join(', ')}, ?, 0)`,
    row.id,
    ...cols.map((c) => values[c] as any),
    row.updated_at
  );
  return true;
}

/** Push dirty rows and tombstones; on success clear exactly what was sent. */
async function pushLocal(db: SQLiteDatabase, apiUrl: string, token: string) {
  const changes = {} as Record<SyncTable, Row[]>;
  const sent: { t: SyncTable; uuid: string; updated_at: number; tomb: boolean }[] = [];

  for (const t of SYNC_TABLES) {
    const { cols, refs } = WIRE[t];
    const select = cols
      .map((c) => (refs[c] ? `(SELECT p.uuid FROM ${refs[c]} p WHERE p.id = x.${c}) AS ${c}` : `x.${c}`))
      .join(', ');
    const rows = await db.getAllAsync<Row>(
      `SELECT x.uuid, x.updated_at, ${select} FROM ${t} x WHERE x.dirty = 1 AND x.uuid IS NOT NULL`
    );
    changes[t] = rows.map((r) => {
      const out: Row = { id: r.uuid, updated_at: r.updated_at, deleted: false };
      for (const c of cols) out[c] = r[c];
      if (t === 'exercises' && !out.name) out.name = '';
      sent.push({ t, uuid: r.uuid, updated_at: r.updated_at, tomb: false });
      return out;
    });

    const tombs = await db.getAllAsync<{ uuid: string; deleted_at: number }>(
      'SELECT uuid, deleted_at FROM sync_tombstones WHERE tbl = ?',
      t
    );
    for (const tb of tombs) {
      changes[t].push({ id: tb.uuid, updated_at: tb.deleted_at, deleted: true });
      sent.push({ t, uuid: tb.uuid, updated_at: tb.deleted_at, tomb: true });
    }
  }

  if (sent.length === 0) return 0;

  // Send in chunks to respect the server's per-request limit.
  const CHUNK = 4000;
  const flat = SYNC_TABLES.flatMap((t) => changes[t].map((r) => [t, r] as const));
  for (let i = 0; i < flat.length; i += CHUNK) {
    const part = {} as Record<SyncTable, Row[]>;
    for (const t of SYNC_TABLES) part[t] = [];
    for (const [t, r] of flat.slice(i, i + CHUNK)) part[t].push(r);
    await apiRequest(apiUrl, '/sync/push', { method: 'POST', body: { changes: part }, token, timeoutMs: 60000 });
  }

  // Clear dirty flags only for rows that weren't edited again while we were pushing.
  await setApplying(db, true);
  try {
    await db.withTransactionAsync(async () => {
      for (const s of sent) {
        if (s.tomb) {
          await db.runAsync(
            'DELETE FROM sync_tombstones WHERE tbl = ? AND uuid = ? AND deleted_at = ?',
            s.t,
            s.uuid,
            s.updated_at
          );
        } else {
          await db.runAsync(`UPDATE ${s.t} SET dirty = 0 WHERE uuid = ? AND updated_at = ?`, s.uuid, s.updated_at);
        }
      }
    });
  } finally {
    await setApplying(db, false);
  }
  return sent.length;
}
