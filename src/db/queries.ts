import type { SQLiteDatabase } from 'expo-sqlite';
import { estimate1RM } from '../utils/oneRepMax';
import type { Unit } from '../utils/format';
import type { PlanTemplate } from './templates';

export type Exercise = {
  id: number;
  name: string;
  muscle_group: string;
  created_at: number;
};

export type Workout = {
  id: number;
  date: number;
  notes: string;
  finished_at: number | null;
  title: string;
  day_id: number | null;
};

export type WorkoutSet = {
  id: number;
  workout_id: number;
  exercise_id: number;
  set_number: number;
  reps: number;
  weight_kg: number;
  created_at: number;
  done: number; // 0 | 1
  kind: SetKind;
};

export type SetKind = 'normal' | 'warmup' | 'drop';

export type WorkoutExercise = {
  exercise: Exercise;
  sets: WorkoutSet[];
};

export type LastSession = {
  workoutId: number;
  date: number;
  sets: WorkoutSet[];
};

export type PersonalRecords = {
  maxWeight: number;
  best1RM: number;
  maxVolume: number; // best single-set reps*weight
  hasHistory: boolean;
};

// ---------- Exercises ----------

export function getExercises(db: SQLiteDatabase) {
  return db.getAllAsync<Exercise>('SELECT * FROM exercises ORDER BY muscle_group, name COLLATE NOCASE');
}

export function getExercise(db: SQLiteDatabase, id: number) {
  return db.getFirstAsync<Exercise>('SELECT * FROM exercises WHERE id = ?', id);
}

export async function addExercise(db: SQLiteDatabase, name: string, muscleGroup: string) {
  const r = await db.runAsync(
    'INSERT INTO exercises (name, muscle_group, created_at) VALUES (?, ?, ?)',
    name.trim(),
    muscleGroup,
    Date.now()
  );
  return r.lastInsertRowId;
}

export function updateExercise(db: SQLiteDatabase, id: number, name: string, muscleGroup: string) {
  return db.runAsync(
    'UPDATE exercises SET name = ?, muscle_group = ? WHERE id = ?',
    name.trim(),
    muscleGroup,
    id
  );
}

export function deleteExercise(db: SQLiteDatabase, id: number) {
  return db.runAsync('DELETE FROM exercises WHERE id = ?', id);
}

// ---------- Workouts ----------

export function getActiveWorkout(db: SQLiteDatabase) {
  return db.getFirstAsync<Workout>(
    'SELECT * FROM workouts WHERE finished_at IS NULL ORDER BY id DESC LIMIT 1'
  );
}

export async function startWorkout(db: SQLiteDatabase, title = '', dayId: number | null = null) {
  const r = await db.runAsync(
    'INSERT INTO workouts (date, notes, title, day_id) VALUES (?, ?, ?, ?)',
    Date.now(),
    '',
    title,
    dayId
  );
  return r.lastInsertRowId;
}

/** Number of sets in a workout that are not ticked as done. */
export async function countUndoneSets(db: SQLiteDatabase, workoutId: number) {
  const r = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM workout_sets WHERE workout_id = ? AND done = 0',
    workoutId
  );
  return r?.n ?? 0;
}

/** Finish: drops sets not ticked as done, renumbers, and saves. Returns false if nothing was logged. */
export async function finishWorkout(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM workout_sets WHERE workout_id = ? AND done = 0', id);
  const remaining = await db.getAllAsync<{ id: number; exercise_id: number }>(
    'SELECT id, exercise_id FROM workout_sets WHERE workout_id = ? ORDER BY exercise_id, set_number, id',
    id
  );
  const counters = new Map<number, number>();
  for (const s of remaining) {
    const n = (counters.get(s.exercise_id) ?? 0) + 1;
    counters.set(s.exercise_id, n);
    await db.runAsync('UPDATE workout_sets SET set_number = ? WHERE id = ?', n, s.id);
  }
  const c = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM workout_sets WHERE workout_id = ?',
    id
  );
  if (!c || c.n === 0) {
    // Nothing logged: discard the empty workout.
    await db.runAsync('DELETE FROM workouts WHERE id = ?', id);
    return false;
  }
  await db.runAsync('UPDATE workouts SET finished_at = ? WHERE id = ?', Date.now(), id);
  return true;
}

export function deleteWorkout(db: SQLiteDatabase, id: number) {
  return db.runAsync('DELETE FROM workouts WHERE id = ?', id);
}

export function updateWorkoutNotes(db: SQLiteDatabase, id: number, notes: string) {
  return db.runAsync('UPDATE workouts SET notes = ? WHERE id = ?', notes, id);
}

export function getWorkout(db: SQLiteDatabase, id: number) {
  return db.getFirstAsync<Workout>('SELECT * FROM workouts WHERE id = ?', id);
}

/** Sets of a workout grouped by exercise, in the order the exercise was first logged. */
export async function getWorkoutExercises(
  db: SQLiteDatabase,
  workoutId: number
): Promise<WorkoutExercise[]> {
  const sets = await db.getAllAsync<WorkoutSet>(
    'SELECT * FROM workout_sets WHERE workout_id = ? ORDER BY created_at, id',
    workoutId
  );
  const exercises = await getExercises(db);
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const groups = new Map<number, WorkoutExercise>();
  for (const s of sets) {
    let g = groups.get(s.exercise_id);
    if (!g) {
      const ex = byId.get(s.exercise_id);
      if (!ex) continue;
      g = { exercise: ex, sets: [] };
      groups.set(s.exercise_id, g);
    }
    g.sets.push(s);
  }
  for (const g of groups.values()) g.sets.sort((a, b) => a.set_number - b.set_number);
  return [...groups.values()];
}

export type WorkoutSummary = Workout & { exercise_count: number; set_count: number; volume: number };

export function getWorkoutSummaries(db: SQLiteDatabase) {
  return db.getAllAsync<WorkoutSummary>(`
    SELECT w.*,
      COUNT(DISTINCT s.exercise_id) AS exercise_count,
      COUNT(s.id) AS set_count,
      COALESCE(SUM(CASE WHEN s.kind = 'warmup' THEN 0 ELSE s.reps * s.weight_kg END), 0) AS volume
    FROM workouts w
    LEFT JOIN workout_sets s ON s.workout_id = w.id
    WHERE w.finished_at IS NOT NULL
    GROUP BY w.id
    ORDER BY w.date DESC
  `);
}

export type DashboardStats = {
  total: number;
  thisWeek: number;
  weekVolume: number;
  streakWeeks: number;
  lastDate: number | null;
};

function startOfWeek(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  return d.getTime();
}

export async function getDashboardStats(db: SQLiteDatabase): Promise<DashboardStats> {
  const rows = await db.getAllAsync<{ date: number; volume: number }>(`
    SELECT w.date, COALESCE(SUM(CASE WHEN s.kind = 'warmup' THEN 0 ELSE s.reps * s.weight_kg END), 0) AS volume
    FROM workouts w LEFT JOIN workout_sets s ON s.workout_id = w.id
    WHERE w.finished_at IS NOT NULL
    GROUP BY w.id ORDER BY w.date DESC
  `);
  const week = startOfWeek(Date.now());
  const thisWeekRows = rows.filter((r) => r.date >= week);

  // consecutive weeks (ending this week or last week) with at least one workout
  const weeks = new Set(rows.map((r) => startOfWeek(r.date)));
  const WEEK = 7 * 24 * 3600 * 1000;
  let cursor = weeks.has(week) ? week : week - WEEK;
  let streak = 0;
  while (weeks.has(cursor)) {
    streak++;
    cursor = startOfWeek(cursor - WEEK / 2);
  }

  return {
    total: rows.length,
    thisWeek: thisWeekRows.length,
    weekVolume: thisWeekRows.reduce((a, r) => a + r.volume, 0),
    streakWeeks: streak,
    lastDate: rows[0]?.date ?? null,
  };
}

// ---------- Sets ----------

export async function addSet(
  db: SQLiteDatabase,
  workoutId: number,
  exerciseId: number,
  reps: number,
  weightKg: number,
  kind: SetKind = 'normal'
) {
  const n = await db.getFirstAsync<{ n: number }>(
    'SELECT COALESCE(MAX(set_number), 0) AS n FROM workout_sets WHERE workout_id = ? AND exercise_id = ?',
    workoutId,
    exerciseId
  );
  const r = await db.runAsync(
    'INSERT INTO workout_sets (workout_id, exercise_id, set_number, reps, weight_kg, created_at, done, kind) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
    workoutId,
    exerciseId,
    (n?.n ?? 0) + 1,
    reps,
    weightKg,
    Date.now(),
    kind
  );
  return r.lastInsertRowId;
}

export function setSetKind(db: SQLiteDatabase, id: number, kind: SetKind) {
  return db.runAsync('UPDATE workout_sets SET kind = ? WHERE id = ?', kind, id);
}

export function setSetDone(db: SQLiteDatabase, id: number, done: boolean) {
  return db.runAsync('UPDATE workout_sets SET done = ? WHERE id = ?', done ? 1 : 0, id);
}

export function updateSet(db: SQLiteDatabase, id: number, reps: number, weightKg: number) {
  return db.runAsync('UPDATE workout_sets SET reps = ?, weight_kg = ? WHERE id = ?', reps, weightKg, id);
}

export async function deleteSet(db: SQLiteDatabase, set: WorkoutSet) {
  await db.runAsync('DELETE FROM workout_sets WHERE id = ?', set.id);
  await db.runAsync(
    'UPDATE workout_sets SET set_number = set_number - 1 WHERE workout_id = ? AND exercise_id = ? AND set_number > ?',
    set.workout_id,
    set.exercise_id,
    set.set_number
  );
}

export function removeExerciseFromWorkout(db: SQLiteDatabase, workoutId: number, exerciseId: number) {
  return db.runAsync(
    'DELETE FROM workout_sets WHERE workout_id = ? AND exercise_id = ?',
    workoutId,
    exerciseId
  );
}

// ---------- History / records ----------

/** Sets from the most recent finished workout (other than `excludeWorkoutId`) that included this exercise. */
export async function getLastSession(
  db: SQLiteDatabase,
  exerciseId: number,
  excludeWorkoutId: number
): Promise<LastSession | null> {
  const w = await db.getFirstAsync<Workout>(
    `SELECT w.* FROM workouts w
     WHERE w.finished_at IS NOT NULL AND w.id != ?
       AND EXISTS (SELECT 1 FROM workout_sets s WHERE s.workout_id = w.id AND s.exercise_id = ?)
     ORDER BY w.date DESC LIMIT 1`,
    excludeWorkoutId,
    exerciseId
  );
  if (!w) return null;
  const sets = await db.getAllAsync<WorkoutSet>(
    'SELECT * FROM workout_sets WHERE workout_id = ? AND exercise_id = ? ORDER BY set_number',
    w.id,
    exerciseId
  );
  return { workoutId: w.id, date: w.date, sets };
}

/** Records from finished workouts only (warm-ups ignored), optionally excluding one workout. */
export async function getPersonalRecords(
  db: SQLiteDatabase,
  exerciseId: number,
  excludeWorkoutId = -1
): Promise<PersonalRecords> {
  const rows = await db.getAllAsync<{ reps: number; weight_kg: number }>(
    `SELECT s.reps, s.weight_kg FROM workout_sets s
     JOIN workouts w ON w.id = s.workout_id
     WHERE s.exercise_id = ? AND w.finished_at IS NOT NULL AND w.id != ? AND s.kind != 'warmup'`,
    exerciseId,
    excludeWorkoutId
  );
  let maxWeight = 0;
  let best1RM = 0;
  let maxVolume = 0;
  for (const r of rows) {
    maxWeight = Math.max(maxWeight, r.weight_kg);
    best1RM = Math.max(best1RM, estimate1RM(r.weight_kg, r.reps));
    maxVolume = Math.max(maxVolume, r.reps * r.weight_kg);
  }
  return { maxWeight, best1RM, maxVolume, hasHistory: rows.length > 0 };
}

export type ExerciseSession = {
  workoutId: number;
  date: number;
  sets: WorkoutSet[];
};

/** All finished sessions for an exercise, newest first. */
export async function getExerciseHistory(
  db: SQLiteDatabase,
  exerciseId: number
): Promise<ExerciseSession[]> {
  const rows = await db.getAllAsync<WorkoutSet & { date: number }>(
    `SELECT s.*, w.date AS date FROM workout_sets s
     JOIN workouts w ON w.id = s.workout_id
     WHERE s.exercise_id = ? AND w.finished_at IS NOT NULL
     ORDER BY w.date DESC, s.set_number`,
    exerciseId
  );
  const map = new Map<number, ExerciseSession>();
  for (const r of rows) {
    let s = map.get(r.workout_id);
    if (!s) {
      s = { workoutId: r.workout_id, date: r.date, sets: [] };
      map.set(r.workout_id, s);
    }
    s.sets.push(r);
  }
  return [...map.values()];
}

// ---------- Settings ----------

export async function getUnit(db: SQLiteDatabase): Promise<Unit> {
  const r = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'unit'");
  return r?.value === 'lb' ? 'lb' : 'kg';
}

export function setUnit(db: SQLiteDatabase, unit: Unit) {
  return db.runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES ('unit', ?)", unit);
}

// ---------- Plans (routines -> days -> exercises) ----------

export type Routine = { id: number; name: string; created_at: number };
export type RoutineDay = { id: number; routine_id: number; name: string; position: number };
export type DayExercise = {
  id: number;
  day_id: number;
  exercise_id: number;
  position: number;
  target_sets: number;
  name: string;
  muscle_group: string;
};
export type DayWithExercises = RoutineDay & { exercises: DayExercise[] };
export type RoutineFull = Routine & { days: DayWithExercises[]; nextDayId: number | null; lastDone: number | null };

export async function getRoutinesFull(db: SQLiteDatabase): Promise<RoutineFull[]> {
  const routines = await db.getAllAsync<Routine>('SELECT * FROM routines ORDER BY created_at');
  const out: RoutineFull[] = [];
  for (const r of routines) out.push(await getRoutineFull(db, r.id, r));
  return out;
}

export async function getRoutineFull(db: SQLiteDatabase, id: number, r?: Routine): Promise<RoutineFull> {
  const routine = r ?? (await db.getFirstAsync<Routine>('SELECT * FROM routines WHERE id = ?', id));
  if (!routine) throw new Error('Plan not found');
  const days = await db.getAllAsync<RoutineDay>(
    'SELECT * FROM routine_days WHERE routine_id = ? ORDER BY position, id',
    id
  );
  const exs = await db.getAllAsync<DayExercise>(
    `SELECT de.*, e.name, e.muscle_group FROM routine_day_exercises de
     JOIN exercises e ON e.id = de.exercise_id
     JOIN routine_days d ON d.id = de.day_id
     WHERE d.routine_id = ? ORDER BY de.position, de.id`,
    id
  );
  const full = days.map((d) => ({ ...d, exercises: exs.filter((x) => x.day_id === d.id) }));

  // Next day in rotation = the day after the most recently finished one.
  const last = await db.getFirstAsync<{ day_id: number; date: number }>(
    `SELECT w.day_id, w.date FROM workouts w JOIN routine_days d ON d.id = w.day_id
     WHERE d.routine_id = ? AND w.finished_at IS NOT NULL ORDER BY w.date DESC LIMIT 1`,
    id
  );
  let nextDayId = full[0]?.id ?? null;
  if (last && full.length) {
    const i = full.findIndex((d) => d.id === last.day_id);
    if (i >= 0) nextDayId = full[(i + 1) % full.length].id;
  }
  return { ...routine, days: full, nextDayId, lastDone: last?.date ?? null };
}

export async function createRoutine(db: SQLiteDatabase, name: string) {
  const r = await db.runAsync('INSERT INTO routines (name, created_at) VALUES (?, ?)', name.trim(), Date.now());
  return r.lastInsertRowId;
}

export function renameRoutine(db: SQLiteDatabase, id: number, name: string) {
  return db.runAsync('UPDATE routines SET name = ? WHERE id = ?', name.trim(), id);
}

export async function deleteRoutine(db: SQLiteDatabase, id: number) {
  await db.runAsync(
    'UPDATE workouts SET day_id = NULL WHERE day_id IN (SELECT id FROM routine_days WHERE routine_id = ?)',
    id
  );
  await db.runAsync('DELETE FROM routines WHERE id = ?', id);
}

export async function addDay(db: SQLiteDatabase, routineId: number, name: string) {
  const p = await db.getFirstAsync<{ n: number }>(
    'SELECT COALESCE(MAX(position), -1) + 1 AS n FROM routine_days WHERE routine_id = ?',
    routineId
  );
  const r = await db.runAsync(
    'INSERT INTO routine_days (routine_id, name, position) VALUES (?, ?, ?)',
    routineId,
    name.trim(),
    p?.n ?? 0
  );
  return r.lastInsertRowId;
}

export function renameDay(db: SQLiteDatabase, id: number, name: string) {
  return db.runAsync('UPDATE routine_days SET name = ? WHERE id = ?', name.trim(), id);
}

export async function deleteDay(db: SQLiteDatabase, id: number) {
  await db.runAsync('UPDATE workouts SET day_id = NULL WHERE day_id = ?', id);
  await db.runAsync('DELETE FROM routine_days WHERE id = ?', id);
}

export async function addDayExercise(db: SQLiteDatabase, dayId: number, exerciseId: number, sets = 3) {
  const p = await db.getFirstAsync<{ n: number }>(
    'SELECT COALESCE(MAX(position), -1) + 1 AS n FROM routine_day_exercises WHERE day_id = ?',
    dayId
  );
  await db.runAsync(
    'INSERT INTO routine_day_exercises (day_id, exercise_id, position, target_sets) VALUES (?, ?, ?, ?)',
    dayId,
    exerciseId,
    p?.n ?? 0,
    sets
  );
}

export function removeDayExercise(db: SQLiteDatabase, id: number) {
  return db.runAsync('DELETE FROM routine_day_exercises WHERE id = ?', id);
}

export function setDayExerciseSets(db: SQLiteDatabase, id: number, sets: number) {
  return db.runAsync('UPDATE routine_day_exercises SET target_sets = ? WHERE id = ?', Math.max(1, Math.min(10, sets)), id);
}

/** Swap an exercise with its neighbour (dir -1 = up, +1 = down). */
export async function moveDayExercise(db: SQLiteDatabase, day: DayWithExercises, index: number, dir: -1 | 1) {
  const j = index + dir;
  if (j < 0 || j >= day.exercises.length) return;
  const list = [...day.exercises];
  [list[index], list[j]] = [list[j], list[index]];
  for (let i = 0; i < list.length; i++) {
    await db.runAsync('UPDATE routine_day_exercises SET position = ? WHERE id = ?', i, list[i].id);
  }
}

/** Id of an existing plan with this name (case-insensitive), or null. */
export async function findRoutineByName(db: SQLiteDatabase, name: string) {
  const r = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM routines WHERE trim(name) = trim(?) COLLATE NOCASE ORDER BY id LIMIT 1',
    name
  );
  return r?.id ?? null;
}

/**
 * Creates the plan with empty days (you add the exercises yourself).
 * If a plan with the template's name already exists, nothing is created and its id is returned.
 */
export async function createRoutineFromTemplate(
  db: SQLiteDatabase,
  t: PlanTemplate
): Promise<{ id: number; existed: boolean }> {
  const existing = await findRoutineByName(db, t.name);
  if (existing != null) return { id: existing, existed: true };
  const rid = await createRoutine(db, t.name);
  for (const day of t.days) await addDay(db, rid, day);
  return { id: rid, existed: false };
}

/** Start a workout from a plan day: creates the sets, pre-filled from last time. */
export async function startWorkoutFromDay(db: SQLiteDatabase, dayId: number) {
  const day = await db.getFirstAsync<RoutineDay>('SELECT * FROM routine_days WHERE id = ?', dayId);
  if (!day) throw new Error('Day not found');
  const exs = await db.getAllAsync<DayExercise>(
    `SELECT de.*, e.name, e.muscle_group FROM routine_day_exercises de
     JOIN exercises e ON e.id = de.exercise_id
     WHERE de.day_id = ? ORDER BY de.position, de.id`,
    dayId
  );
  const wid = await startWorkout(db, day.name, dayId);
  for (const ex of exs) {
    const last = await getLastSession(db, ex.exercise_id, wid);
    for (let i = 0; i < ex.target_sets; i++) {
      // Same set types you picked last time (e.g. your 2 warm-ups), so you don't re-mark them every session.
      const same = last?.sets[i];
      const p = same ?? last?.sets.filter((s) => s.kind !== 'warmup').at(-1) ?? last?.sets.at(-1);
      await addSet(db, wid, ex.exercise_id, p?.reps ?? 0, p?.weight_kg ?? 0, same?.kind ?? 'normal');
    }
  }
  return wid;
}

// ---------- Backup ----------

type RoutineDayExerciseRow = Omit<DayExercise, 'name' | 'muscle_group'>;

export type BackupFile = {
  app: 'gymapp';
  version: 1 | 2;
  exportedAt: number;
  exercises: Exercise[];
  workouts: Workout[];
  workout_sets: WorkoutSet[];
  routines?: Routine[];
  routine_days?: RoutineDay[];
  routine_day_exercises?: RoutineDayExerciseRow[];
  exercise_videos?: ExerciseVideo[];
};

export async function exportAll(db: SQLiteDatabase): Promise<BackupFile> {
  return {
    app: 'gymapp',
    version: 2,
    exportedAt: Date.now(),
    exercises: await db.getAllAsync<Exercise>('SELECT * FROM exercises'),
    workouts: await db.getAllAsync<Workout>('SELECT * FROM workouts'),
    workout_sets: await db.getAllAsync<WorkoutSet>('SELECT * FROM workout_sets'),
    routines: await db.getAllAsync<Routine>('SELECT * FROM routines'),
    routine_days: await db.getAllAsync<RoutineDay>('SELECT * FROM routine_days'),
    routine_day_exercises: await db.getAllAsync<RoutineDayExerciseRow>('SELECT * FROM routine_day_exercises'),
    exercise_videos: await db.getAllAsync<ExerciseVideo>(
      'SELECT id, exercise_id, source, url, title, position, created_at FROM exercise_videos'
    ),
  };
}

export async function importAll(db: SQLiteDatabase, data: BackupFile) {
  if (data?.app !== 'gymapp' || !Array.isArray(data.exercises) || !Array.isArray(data.workouts) || !Array.isArray(data.workout_sets)) {
    throw new Error('This file is not a GymApp backup.');
  }
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM exercise_videos');
    await db.runAsync('DELETE FROM routine_day_exercises');
    await db.runAsync('DELETE FROM routine_days');
    await db.runAsync('DELETE FROM routines');
    await db.runAsync('DELETE FROM workout_sets');
    await db.runAsync('DELETE FROM workouts');
    await db.runAsync('DELETE FROM exercises');
    for (const e of data.exercises) {
      await db.runAsync(
        'INSERT INTO exercises (id, name, muscle_group, created_at) VALUES (?, ?, ?, ?)',
        e.id, e.name, e.muscle_group, e.created_at
      );
    }
    for (const v of data.exercise_videos ?? []) {
      await db.runAsync(
        'INSERT INTO exercise_videos (id, exercise_id, source, url, title, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        v.id, v.exercise_id, v.source === 'file' ? 'file' : 'youtube', v.url, v.title ?? '', v.position ?? 0, v.created_at ?? Date.now()
      );
    }
    for (const r of data.routines ?? []) {
      await db.runAsync('INSERT INTO routines (id, name, created_at) VALUES (?, ?, ?)', r.id, r.name, r.created_at);
    }
    for (const d of data.routine_days ?? []) {
      await db.runAsync(
        'INSERT INTO routine_days (id, routine_id, name, position) VALUES (?, ?, ?, ?)',
        d.id, d.routine_id, d.name, d.position
      );
    }
    for (const x of data.routine_day_exercises ?? []) {
      await db.runAsync(
        'INSERT INTO routine_day_exercises (id, day_id, exercise_id, position, target_sets) VALUES (?, ?, ?, ?, ?)',
        x.id, x.day_id, x.exercise_id, x.position, x.target_sets
      );
    }
    for (const w of data.workouts) {
      await db.runAsync(
        'INSERT INTO workouts (id, date, notes, finished_at, title, day_id) VALUES (?, ?, ?, ?, ?, ?)',
        w.id, w.date, w.notes ?? '', w.finished_at, w.title ?? '', w.day_id ?? null
      );
    }
    for (const s of data.workout_sets) {
      await db.runAsync(
        'INSERT INTO workout_sets (id, workout_id, exercise_id, set_number, reps, weight_kg, created_at, done, kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        s.id, s.workout_id, s.exercise_id, s.set_number, s.reps, s.weight_kg, s.created_at, s.done ?? 1,
        s.kind === 'warmup' || s.kind === 'drop' ? s.kind : 'normal'
      );
    }
  });
}

// ---------- Exercise videos ----------

export type VideoSource = 'youtube' | 'file';

export type ExerciseVideo = {
  id: number;
  exercise_id: number;
  source: VideoSource;
  url: string;
  title: string;
  position: number;
  created_at: number;
};

export function getExerciseVideos(db: SQLiteDatabase, exerciseId: number) {
  return db.getAllAsync<ExerciseVideo>(
    'SELECT id, exercise_id, source, url, title, position, created_at FROM exercise_videos WHERE exercise_id = ? ORDER BY position, id',
    exerciseId
  );
}

export async function addExerciseVideo(
  db: SQLiteDatabase,
  exerciseId: number,
  source: VideoSource,
  url: string,
  title = ''
) {
  const p = await db.getFirstAsync<{ n: number }>(
    'SELECT COALESCE(MAX(position), -1) + 1 AS n FROM exercise_videos WHERE exercise_id = ?',
    exerciseId
  );
  const r = await db.runAsync(
    'INSERT INTO exercise_videos (exercise_id, source, url, title, position, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    exerciseId,
    source,
    url,
    title.trim(),
    p?.n ?? 0,
    Date.now()
  );
  return r.lastInsertRowId;
}

export function renameExerciseVideo(db: SQLiteDatabase, id: number, title: string) {
  return db.runAsync('UPDATE exercise_videos SET title = ? WHERE id = ?', title.trim(), id);
}

export function deleteExerciseVideo(db: SQLiteDatabase, id: number) {
  return db.runAsync('DELETE FROM exercise_videos WHERE id = ?', id);
}
