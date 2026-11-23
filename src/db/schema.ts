import type { SQLiteDatabase } from 'expo-sqlite';
import { SEED_EXERCISES } from './seed';

const DB_VERSION = 5;

export async function migrateDb(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let current = row?.user_version ?? 0;
  if (current >= DB_VERSION) return;

  if (current === 0) {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS exercises (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        muscle_group TEXT NOT NULL DEFAULT 'Other',
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS workouts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date INTEGER NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        finished_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS workout_sets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
        exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
        set_number INTEGER NOT NULL,
        reps INTEGER NOT NULL,
        weight_kg REAL NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sets_exercise ON workout_sets(exercise_id);
      CREATE INDEX IF NOT EXISTS idx_sets_workout ON workout_sets(workout_id);
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    const now = Date.now();
    for (const [name, group] of SEED_EXERCISES) {
      await db.runAsync(
        'INSERT OR IGNORE INTO exercises (name, muscle_group, created_at) VALUES (?, ?, ?)',
        name,
        group,
        now
      );
    }
    current = 1;
  }

  if (current === 1) {
    // v2: training plans (routines -> days -> exercises), workout title/day, per-set "done"
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS routines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS routine_days (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        routine_id INTEGER NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        position INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS routine_day_exercises (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        day_id INTEGER NOT NULL REFERENCES routine_days(id) ON DELETE CASCADE,
        exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        target_sets INTEGER NOT NULL DEFAULT 3
      );
      CREATE INDEX IF NOT EXISTS idx_days_routine ON routine_days(routine_id);
      CREATE INDEX IF NOT EXISTS idx_dayex_day ON routine_day_exercises(day_id);
      ALTER TABLE workouts ADD COLUMN title TEXT NOT NULL DEFAULT '';
      ALTER TABLE workouts ADD COLUMN day_id INTEGER;
      ALTER TABLE workout_sets ADD COLUMN done INTEGER NOT NULL DEFAULT 1;
    `);
    current = 2;
  }

  if (current === 2) {
    // v3: cloud sync. Every synced row gets a global id (uuid), a last-edit time and a dirty flag,
    // maintained by triggers so the rest of the app doesn't need to know about sync.
    let sql = `
      CREATE TABLE IF NOT EXISTS sync_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        applying INTEGER NOT NULL DEFAULT 0,
        last_version INTEGER NOT NULL DEFAULT 0,
        last_sync_at INTEGER,
        api_url TEXT NOT NULL DEFAULT '',
        token TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT ''
      );
      INSERT OR IGNORE INTO sync_meta (id) VALUES (1);
      CREATE TABLE IF NOT EXISTS sync_tombstones (
        tbl TEXT NOT NULL,
        uuid TEXT NOT NULL,
        deleted_at INTEGER NOT NULL,
        PRIMARY KEY (tbl, uuid)
      );
    `;
    // Tables that existed at v3 (later tables are created with the sync columns already).
    for (const t of V3_SYNC_TABLES) {
      sql += `
        ALTER TABLE ${t} ADD COLUMN uuid TEXT;
        ALTER TABLE ${t} ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE ${t} ADD COLUMN dirty INTEGER NOT NULL DEFAULT 0;
        UPDATE ${t} SET uuid = lower(hex(randomblob(16))), updated_at = ${NOW_MS}, dirty = 1;
        CREATE UNIQUE INDEX IF NOT EXISTS ux_${t}_uuid ON ${t}(uuid);
        ${syncTriggers(t)}
      `;
    }
    await db.execAsync(sql);
    current = 3;
  }

  if (current === 3) {
    // v4: set type chosen by the user — 'normal' | 'warmup' | 'drop'
    await db.execAsync(`ALTER TABLE workout_sets ADD COLUMN kind TEXT NOT NULL DEFAULT 'normal';`);
    current = 4;
  }

  if (current === 4) {
    // v5: videos per exercise - YouTube links or video files saved on this phone
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS exercise_videos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
        source TEXT NOT NULL,            -- 'youtube' | 'file'
        url TEXT NOT NULL,               -- YouTube link, or local file uri
        title TEXT NOT NULL DEFAULT '',
        position INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        uuid TEXT,
        updated_at INTEGER NOT NULL DEFAULT 0,
        dirty INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_videos_exercise ON exercise_videos(exercise_id);
      CREATE UNIQUE INDEX IF NOT EXISTS ux_exercise_videos_uuid ON exercise_videos(uuid);
      ${syncTriggers('exercise_videos')}
    `);
    current = 5;
  }

  await db.execAsync(`PRAGMA user_version = ${DB_VERSION}`);
}

const V3_SYNC_TABLES = [
  'exercises',
  'routines',
  'routine_days',
  'routine_day_exercises',
  'workouts',
  'workout_sets',
];

export const SYNC_TABLES = [
  'exercises',
  'exercise_videos',
  'routines',
  'routine_days',
  'routine_day_exercises',
  'workouts',
  'workout_sets',
] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

export const NOW_MS = `CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)`;
const NOT_APPLYING = `(SELECT applying FROM sync_meta WHERE id = 1) = 0`;

/**
 * Local edits -> stamp updated_at + mark dirty; local deletes -> tombstone.
 * Skipped while `sync_meta.applying = 1` (i.e. when the sync engine writes server data).
 */
function syncTriggers(t: string) {
  return `
    CREATE TRIGGER IF NOT EXISTS ${t}_sync_ai AFTER INSERT ON ${t}
    BEGIN
      UPDATE ${t} SET uuid = COALESCE(NEW.uuid, lower(hex(randomblob(16)))) WHERE id = NEW.id AND NEW.uuid IS NULL;
      UPDATE ${t} SET updated_at = ${NOW_MS}, dirty = 1 WHERE id = NEW.id AND ${NOT_APPLYING};
    END;
    CREATE TRIGGER IF NOT EXISTS ${t}_sync_au AFTER UPDATE ON ${t}
    WHEN ${NOT_APPLYING} AND NEW.dirty = OLD.dirty AND NEW.uuid IS OLD.uuid
    BEGIN
      UPDATE ${t} SET updated_at = ${NOW_MS}, dirty = 1 WHERE id = NEW.id;
    END;
    CREATE TRIGGER IF NOT EXISTS ${t}_sync_ad AFTER DELETE ON ${t}
    WHEN ${NOT_APPLYING} AND OLD.uuid IS NOT NULL
    BEGIN
      INSERT OR REPLACE INTO sync_tombstones (tbl, uuid, deleted_at) VALUES ('${t}', OLD.uuid, ${NOW_MS});
    END;
  `;
}
