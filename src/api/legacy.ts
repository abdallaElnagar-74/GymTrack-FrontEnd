import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import { defaultDatabaseDirectory, deleteDatabaseAsync, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { apiRequest, configuredApiUrl, normalizeUrl, resolveApiUrl } from './http';
import { SYNC_TABLES, WIRE, type SyncTable } from './legacyWire';
import { linkGuest, linkLegacyDevice, loadSession, saveSession, type Session } from './session';
import { kv } from './storage';

/**
 * Older app versions kept all data in SQLite on the phone and synced it in the background.
 * On the first launch of this version: reuse that database's account, upload everything in it
 * to the server, then delete it. Runs once; if it fails (e.g. offline) it is retried next launch.
 */

const DB_NAME = 'gymapp.db';
const DONE_KEY = 'gym.legacyMigrated';

type Meta = {
  api_url: string;
  token: string;
  email: string;
  device_email?: string;
  device_secret?: string;
};
type Row = Record<string, any>;

async function openOldDatabase(): Promise<SQLiteDatabase | null> {
  if (Platform.OS !== 'web') {
    try {
      if (!new File(defaultDatabaseDirectory, DB_NAME).exists) return null;
    } catch {
      return null;
    }
  }
  const db = await openDatabaseAsync(DB_NAME);
  const t = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'sync_meta'"
  );
  if (t?.n) return db;
  await db.closeAsync();
  await deleteDatabaseAsync(DB_NAME); // nothing in it (e.g. created by the check above on web)
  return null;
}

/** The account to upload into: the one already in use, else the old database's, else a new guest. */
async function accountFor(meta: Meta | null): Promise<Session | null> {
  const current = await loadSession();
  if (current) return current;
  const url = resolveApiUrl(meta?.api_url ?? '');
  if (!url) return null;
  const configured = configuredApiUrl();
  if (meta?.token && (!configured || normalizeUrl(meta.api_url) === configured)) {
    const s = { apiUrl: url, token: meta.token, email: meta.email };
    await saveSession(s);
    return s;
  }
  if (meta?.device_email && meta.device_secret) {
    return linkLegacyDevice(url, { email: meta.device_email, password: meta.device_secret });
  }
  return linkGuest(url, { seed: false }); // the old database has its own exercises
}

/** Every row (and delete) in the old database, in the server's sync format. */
async function readAll(db: SQLiteDatabase) {
  const changes = {} as Record<SyncTable, Row[]>;
  for (const t of SYNC_TABLES) {
    const { cols, refs } = WIRE[t];
    const select = cols
      .map((c) => (refs[c] ? `(SELECT p.uuid FROM ${refs[c]} p WHERE p.id = x.${c}) AS ${c}` : `x.${c}`))
      .join(', ');
    let rows: Row[] = [];
    try {
      rows = await db.getAllAsync<Row>(`SELECT x.uuid, x.updated_at, ${select} FROM ${t} x WHERE x.uuid IS NOT NULL`);
    } catch {
      // table missing in a very old database
    }
    changes[t] = rows.map((r) => {
      const out: Row = { id: r.uuid, updated_at: r.updated_at || Date.now(), deleted: false };
      for (const c of cols) out[c] = r[c];
      if (t === 'workouts') out.notes ??= '';
      return out;
    });
    try {
      const tombs = await db.getAllAsync<{ uuid: string; deleted_at: number }>(
        'SELECT uuid, deleted_at FROM sync_tombstones WHERE tbl = ?',
        t
      );
      for (const tb of tombs) changes[t].push({ id: tb.uuid, updated_at: tb.deleted_at, deleted: true });
    } catch {
      // no tombstones table
    }
  }
  return changes;
}

async function upload(s: Session, changes: Record<SyncTable, Row[]>) {
  // The server takes at most 5000 rows per request; newer edits win over what it already has.
  const CHUNK = 4000;
  const flat = SYNC_TABLES.flatMap((t) => changes[t].map((r) => [t, r] as const));
  for (let i = 0; i < flat.length; i += CHUNK) {
    const part = Object.fromEntries(SYNC_TABLES.map((t) => [t, [] as Row[]])) as Record<SyncTable, Row[]>;
    for (const [t, r] of flat.slice(i, i + CHUNK)) part[t].push(r);
    await apiRequest(s.apiUrl, '/sync/push', { method: 'POST', body: { changes: part }, token: s.token, timeoutMs: 60000 });
  }
}

export async function migrateLegacyData(): Promise<void> {
  if (await kv.get(DONE_KEY)) return;
  const db = await openOldDatabase();
  if (!db) {
    await kv.set(DONE_KEY, '1');
    return;
  }
  try {
    const meta = await db.getFirstAsync<Meta>('SELECT * FROM sync_meta WHERE id = 1');
    const s = await accountFor(meta);
    if (!s) return; // no server configured yet: try again next launch

    const changes = await readAll(db);
    const total = SYNC_TABLES.reduce((n, t) => n + changes[t].length, 0);
    if (total) await upload(s, changes);
    console.log(`[legacy] uploaded ${total} rows from the old on-phone database`);

    const unit = await db
      .getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'unit'")
      .catch(() => null);
    if (unit?.value === 'lb') {
      await apiRequest(s.apiUrl, '/api/settings', { method: 'PUT', body: { unit: 'lb' }, token: s.token });
    }
  } finally {
    await db.closeAsync();
  }
  await deleteDatabaseAsync(DB_NAME);
  await kv.set(DONE_KEY, '1');
}
