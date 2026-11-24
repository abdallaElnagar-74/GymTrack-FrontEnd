import { ApiError } from '../api/http';
import type { Api } from '../api/SessionContext';
import type { Unit } from '../utils/format';
import type { PlanTemplate } from './templates';

/**
 * All app data lives in MongoDB on the backend; every function here is a request to its
 * data API (see backend/src/data.ts). Nothing is stored on the phone.
 */

export type Exercise = {
  id: string;
  name: string;
  muscle_group: string;
  created_at: number;
};

export type Workout = {
  id: string;
  date: number;
  notes: string;
  finished_at: number | null;
  title: string;
  day_id: string | null;
};

export type SetKind = 'normal' | 'warmup' | 'drop';

export type WorkoutSet = {
  id: string;
  workout_id: string;
  exercise_id: string;
  set_number: number;
  reps: number;
  weight_kg: number;
  created_at: number;
  done: number; // 0 | 1
  kind: SetKind;
};

export type WorkoutExercise = {
  exercise: Exercise;
  sets: WorkoutSet[];
  /** Only with `getWorkoutExercises(..., { context: true })`: last finished session of this exercise. */
  last?: LastSession | null;
  /** Only with `{ context: true }`: personal records, not counting this workout. */
  records?: PersonalRecords;
};

export type LastSession = {
  workoutId: string;
  date: number;
  sets: WorkoutSet[];
};

export type PersonalRecords = {
  maxWeight: number;
  best1RM: number;
  maxVolume: number; // best single-set reps*weight
  hasHistory: boolean;
};

/** `null` instead of an error when the item doesn't exist (e.g. deleted on another phone). */
async function orNull<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

const q = (params: Record<string, string | number>) =>
  '?' + Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');

// ---------- Exercises ----------

export function getExercises(api: Api) {
  return api.get<Exercise[]>('/exercises');
}

export function getExercise(api: Api, id: string) {
  return orNull(api.get<Exercise>(`/exercises/${id}`));
}

/** Throws ApiError 409 if an exercise with that name already exists. */
export async function addExercise(api: Api, name: string, muscleGroup: string) {
  const r = await api.post<{ id: string }>('/exercises', { name: name.trim(), muscle_group: muscleGroup });
  return r.id;
}

export function updateExercise(api: Api, id: string, name: string, muscleGroup: string) {
  return api.patch(`/exercises/${id}`, { name: name.trim(), muscle_group: muscleGroup });
}

/** Also deletes its logged sets, plan entries and videos. */
export function deleteExercise(api: Api, id: string) {
  return api.del(`/exercises/${id}`);
}

// ---------- Workouts ----------

export function getActiveWorkout(api: Api) {
  return api.get<Workout | null>('/workouts/active');
}

export async function startWorkout(api: Api, title = '', dayId: string | null = null) {
  return (await api.post<{ id: string }>('/workouts', { title, day_id: dayId })).id;
}

/** Number of sets in a workout that are not ticked as done. */
export async function countUndoneSets(api: Api, workoutId: string) {
  return (await api.get<{ count: number }>(`/workouts/${workoutId}/undone-count`)).count;
}

/** Finish: drops sets not ticked as done, renumbers, and saves. Returns false if nothing was logged. */
export async function finishWorkout(api: Api, id: string) {
  return (await api.post<{ saved: boolean }>(`/workouts/${id}/finish`)).saved;
}

export function deleteWorkout(api: Api, id: string) {
  return api.del(`/workouts/${id}`);
}

export function updateWorkoutNotes(api: Api, id: string, notes: string) {
  return api.patch(`/workouts/${id}`, { notes });
}

export function getWorkout(api: Api, id: string) {
  return orNull(api.get<Workout>(`/workouts/${id}`));
}

/**
 * Sets of a workout grouped by exercise, in the order the exercise was first logged.
 * `context: true` also returns each exercise's last session and records (one request for the whole workout).
 */
export function getWorkoutExercises(api: Api, workoutId: string, { context = false } = {}) {
  return api.get<WorkoutExercise[]>(`/workouts/${workoutId}/exercises${context ? '?context=1' : ''}`);
}

export type WorkoutSummary = Workout & { exercise_count: number; set_count: number; volume: number };

export function getWorkoutSummaries(api: Api) {
  return api.get<WorkoutSummary[]>('/workouts/summaries');
}

export type DashboardStats = {
  total: number;
  thisWeek: number;
  weekVolume: number;
  streakWeeks: number;
  lastDate: number | null;
};

export function getDashboardStats(api: Api) {
  // Weeks start on Monday in the phone's time zone.
  return api.get<DashboardStats>(`/stats/dashboard${q({ tz: new Date().getTimezoneOffset() })}`);
}

// ---------- Sets ----------

export async function addSet(
  api: Api,
  workoutId: string,
  exerciseId: string,
  reps: number,
  weightKg: number,
  kind: SetKind = 'normal'
) {
  const r = await api.post<{ id: string }>(`/workouts/${workoutId}/sets`, {
    exercise_id: exerciseId,
    reps,
    weight_kg: weightKg,
    kind,
  });
  return r.id;
}

export function setSetKind(api: Api, id: string, kind: SetKind) {
  return api.patch(`/sets/${id}`, { kind });
}

export function setSetDone(api: Api, id: string, done: boolean) {
  return api.patch(`/sets/${id}`, { done });
}

export function updateSet(api: Api, id: string, reps: number, weightKg: number) {
  return api.patch(`/sets/${id}`, { reps, weight_kg: weightKg });
}

export function deleteSet(api: Api, set: WorkoutSet) {
  return api.del(`/sets/${set.id}`);
}

export function removeExerciseFromWorkout(api: Api, workoutId: string, exerciseId: string) {
  return api.del(`/workouts/${workoutId}/exercises/${exerciseId}`);
}

// ---------- History / records ----------

/** Sets from the most recent finished workout (other than `excludeWorkoutId`) that included this exercise. */
export function getLastSession(api: Api, exerciseId: string, excludeWorkoutId: string) {
  return api.get<LastSession | null>(`/exercises/${exerciseId}/last-session${q({ exclude: excludeWorkoutId })}`);
}

/** Records from finished workouts only (warm-ups ignored), optionally excluding one workout. */
export function getPersonalRecords(api: Api, exerciseId: string, excludeWorkoutId = '') {
  return api.get<PersonalRecords>(`/exercises/${exerciseId}/records${q({ exclude: excludeWorkoutId })}`);
}

export type ExerciseSession = {
  workoutId: string;
  date: number;
  sets: WorkoutSet[];
};

/** All finished sessions for an exercise, newest first. */
export function getExerciseHistory(api: Api, exerciseId: string) {
  return api.get<ExerciseSession[]>(`/exercises/${exerciseId}/history`);
}

// ---------- Settings ----------

export type Settings = { unit: Unit; rest_seconds: number };

export async function getSettings(api: Api): Promise<Settings> {
  const s = await api.get<Partial<Settings>>('/settings');
  return { unit: s.unit === 'lb' ? 'lb' : 'kg', rest_seconds: s.rest_seconds ?? 60 };
}

/** Saves only the fields given. */
export function saveSettings(api: Api, patch: Partial<Settings>) {
  return api.put('/settings', patch);
}

// ---------- Plans (routines -> days -> exercises) ----------

export type Routine = { id: string; name: string; created_at: number };
export type RoutineDay = { id: string; routine_id: string; name: string; position: number };
export type DayExercise = {
  id: string;
  day_id: string;
  exercise_id: string;
  position: number;
  target_sets: number;
  name: string;
  muscle_group: string;
};
export type DayWithExercises = RoutineDay & { exercises: DayExercise[] };
export type RoutineFull = Routine & { days: DayWithExercises[]; nextDayId: string | null; lastDone: number | null };

export function getRoutinesFull(api: Api) {
  return api.get<RoutineFull[]>('/routines');
}

export function getRoutineFull(api: Api, id: string) {
  return api.get<RoutineFull>(`/routines/${id}`);
}

export async function createRoutine(api: Api, name: string) {
  return (await api.post<{ id: string }>('/routines', { name: name.trim() })).id;
}

export function renameRoutine(api: Api, id: string, name: string) {
  return api.patch(`/routines/${id}`, { name: name.trim() });
}

/** Deletes the plan and its days; workouts done from it stay in the history. */
export function deleteRoutine(api: Api, id: string) {
  return api.del(`/routines/${id}`);
}

export async function addDay(api: Api, routineId: string, name: string) {
  return (await api.post<{ id: string }>(`/routines/${routineId}/days`, { name: name.trim() })).id;
}

export function renameDay(api: Api, id: string, name: string) {
  return api.patch(`/days/${id}`, { name: name.trim() });
}

export function deleteDay(api: Api, id: string) {
  return api.del(`/days/${id}`);
}

export async function addDayExercise(api: Api, dayId: string, exerciseId: string, sets = 3) {
  await api.post(`/days/${dayId}/exercises`, { exercise_id: exerciseId, target_sets: sets });
}

export function removeDayExercise(api: Api, id: string) {
  return api.del(`/day-exercises/${id}`);
}

export function setDayExerciseSets(api: Api, id: string, sets: number) {
  return api.patch(`/day-exercises/${id}`, { target_sets: Math.max(1, Math.min(10, sets)) });
}

/** Swap an exercise with its neighbour (dir -1 = up, +1 = down). */
export async function moveDayExercise(api: Api, day: DayWithExercises, index: number, dir: -1 | 1) {
  const j = index + dir;
  if (j < 0 || j >= day.exercises.length) return;
  const list = [...day.exercises];
  [list[index], list[j]] = [list[j], list[index]];
  await api.put(`/days/${day.id}/order`, { ids: list.map((x) => x.id) });
}

/**
 * Creates the plan with empty days (you add the exercises yourself).
 * If a plan with the template's name already exists, nothing is created and its id is returned.
 */
export function createRoutineFromTemplate(api: Api, t: PlanTemplate) {
  return api.post<{ id: string; existed: boolean }>('/routines/from-template', { name: t.name, days: t.days });
}

/** Start a workout from a plan day: creates the sets, pre-filled from last time. */
export async function startWorkoutFromDay(api: Api, dayId: string) {
  return (await api.post<{ id: string }>('/workouts/from-day', { day_id: dayId })).id;
}

// ---------- Backup ----------

export type BackupFile = {
  app: 'gymapp';
  version: number;
  exportedAt: number;
  exercises: unknown[];
  workouts: unknown[];
  workout_sets: unknown[];
  routines?: unknown[];
  routine_days?: unknown[];
  routine_day_exercises?: unknown[];
  exercise_videos?: unknown[];
};

export function exportAll(api: Api) {
  return api.get<BackupFile>('/backup');
}

/** Replaces ALL data in the account with the backup (older backups with numeric ids work too). */
export async function importAll(api: Api, data: BackupFile) {
  if (data?.app !== 'gymapp' || !Array.isArray(data.exercises) || !Array.isArray(data.workouts) || !Array.isArray(data.workout_sets)) {
    throw new Error('This file is not a GymApp backup.');
  }
  await api.post('/backup', data);
}

// ---------- Exercise videos ----------

export type VideoSource = 'youtube' | 'file';

export type ExerciseVideo = {
  id: string;
  exercise_id: string;
  source: VideoSource;
  url: string;
  title: string;
  position: number;
  created_at: number;
};

export function getExerciseVideos(api: Api, exerciseId: string) {
  return api.get<ExerciseVideo[]>(`/exercises/${exerciseId}/videos`);
}

export async function addExerciseVideo(api: Api, exerciseId: string, source: VideoSource, url: string, title = '') {
  return (await api.post<{ id: string }>(`/exercises/${exerciseId}/videos`, { source, url, title: title.trim() })).id;
}

export function renameExerciseVideo(api: Api, id: string, title: string) {
  return api.patch(`/videos/${id}`, { title: title.trim() });
}

export function deleteExerciseVideo(api: Api, id: string) {
  return api.del(`/videos/${id}`);
}
