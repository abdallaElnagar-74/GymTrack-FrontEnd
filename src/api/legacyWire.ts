// Keep this file free of runtime imports: scripts/check-backend.mjs loads it with plain Node
// to verify the backend accepts and returns exactly these columns.

/**
 * Tables of the on-phone database used by older app versions, in dependency order (parents first).
 * Only needed to upload that data once (see legacy.ts).
 */
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

/** Wire format per table: data columns and which of them reference another table. */
export const WIRE: Record<SyncTable, { cols: string[]; refs: Record<string, SyncTable> }> = {
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
