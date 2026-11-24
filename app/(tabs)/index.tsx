import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useApi, type Api } from '@/src/api/SessionContext';

import { ExerciseCard } from '@/src/components/ExerciseCard';
import { ExercisePicker } from '@/src/components/ExercisePicker';
import { RestTimer, type Rest } from '@/src/components/RestTimer';
import { Button, LoadError, Loading, ScreenHeader, StatTile } from '@/src/components/ui';
import { useScreenData } from '@/src/hooks/useScreenData';
import { WorkoutTimer } from '@/src/components/WorkoutTimer';
import {
  addSet,
  deleteSet,
  deleteWorkout,
  finishWorkout,
  getActiveWorkout,
  getDashboardStats,
  getLastSession,
  getRoutinesFull,
  getWorkoutExercises,
  removeExerciseFromWorkout,
  setSetDone,
  setSetKind,
  startWorkout,
  startWorkoutFromDay,
  updateSet,
  type DashboardStats,
  type Exercise,
  type LastSession,
  type RoutineFull,
  type SetKind,
  type Workout,
  type WorkoutExercise,
  type WorkoutSet,
} from '@/src/db/queries';
import { theme } from '@/src/theme';

import { useUnit } from '@/src/UnitContext';
import { confirm, notify } from '@/src/utils/confirm';
import { haptic, reportError } from '@/src/utils/feedback';
import { formatShortDate, toDisplay } from '@/src/utils/format';
import { setVolume } from '@/src/utils/setKind';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Clock reads for tap handlers (kept out of the component so they are never part of rendering). */
const msFromNow = (ms: number) => Date.now() + ms;
const msSince = (t: number) => Date.now() - t;

function formatDuration(ms: number) {
  const min = Math.max(1, Math.round(ms / 60000));
  return min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min} min`;
}

function compact(n: number) {
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

/** Weights/reps typed but not sent yet, per set id. */
type PendingEdits = Map<string, { reps: number; weightKg: number; timer: ReturnType<typeof setTimeout> }>;

function saveEdit(api: Api, pending: PendingEdits, setId: string) {
  const e = pending.get(setId);
  if (!e) return Promise.resolve();
  clearTimeout(e.timer);
  pending.delete(setId);
  return updateSet(api, setId, e.reps, e.weightKg).catch(() => {});
}

/** Send typed weights/reps right away (before reloading, finishing, or leaving the screen). */
const flushEdits = (api: Api, pending: PendingEdits) =>
  Promise.all([...pending.keys()].map((id) => saveEdit(api, pending, id)));

export default function WorkoutScreen() {
  const api = useApi();
  const { unit, restSeconds } = useUnit();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [groups, setGroups] = useState<WorkoutExercise[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [plans, setPlans] = useState<RoutineFull[]>([]);
  const [picker, setPicker] = useState(false);
  // Exercises picked but not on the server yet (shown as placeholder cards).
  const [adding, setAdding] = useState<Exercise[]>([]);
  const [rest, setRest] = useState<Rest | null>(null);
  // Blocks the screen with a spinner while a whole-workout action runs (start, finish, discard).
  const [busy, setBusy] = useState<string | null>(null);
  const pending = useRef<PendingEdits>(new Map());
  // Tick / set-type changes still on their way to the server; finishing waits for them.
  const inFlight = useRef(new Set<Promise<unknown>>());
  // Where each exercise card (and the Finish button) sits in the list, to scroll to the next one.
  const scrollRef = useRef<ScrollViewInstance>(null);
  const cardY = useRef(new Map<string, number>());
  const finishY = useRef(0);
  const track = (p: Promise<unknown>) => {
    const q = p.catch(reportError).finally(() => inFlight.current.delete(q));
    inFlight.current.add(q);
  };

  const load = useCallback(async () => {
    await flushEdits(api, pending.current);
    const w = await getActiveWorkout(api);
    if (w) {
      // Sets plus each exercise's last session and records, in one request.
      const g = await getWorkoutExercises(api, w.id, { context: true });
      setWorkout(w);
      setGroups(g);
    } else {
      const [s, p] = await Promise.all([getDashboardStats(api), getRoutinesFull(api)]);
      setWorkout(null);
      setGroups([]);
      setRest(null);
      setStats(s);
      setPlans(p);
    }
  }, [api]);

  const { status, error, retry, refreshControl } = useScreenData(load);

  /** Reload only the current workout's exercises (after adding / removing sets). */
  const refreshGroups = async () => {
    if (!workout) return;
    await flushEdits(api, pending.current);
    setGroups(await getWorkoutExercises(api, workout.id, { context: true }));
  };

  /** Run a whole-screen action with a spinner; errors are shown, the screen reloads either way. */
  const run = async (label: string, fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      reportError(e);
    } finally {
      await load().catch(() => {});
      setBusy(null);
    }
  };

  const onStartEmpty = () => run('Starting workout…', () => startWorkout(api));

  const onStartDay = (dayId: string) => run('Starting workout…', () => startWorkoutFromDay(api, dayId));

  const onPick = async (ex: Exercise) => {
    if (!workout) return;
    setPicker(false);
    if (groups.some((g) => g.exercise.id === ex.id) || adding.some((a) => a.id === ex.id)) return;
    setAdding((a) => [...a, ex]);
    try {
      const last = await getLastSession(api, ex.id, workout.id);
      const first = last?.sets[0];
      await addSet(api, workout.id, ex.id, first?.reps ?? 0, first?.weight_kg ?? 0, first?.kind ?? 'normal');
      await refreshGroups();
    } catch (e) {
      reportError(e, `Couldn’t add ${ex.name}`);
    } finally {
      setAdding((a) => a.filter((x) => x.id !== ex.id));
    }
  };

  const onAddSet = async (g: WorkoutExercise, last: LastSession | null) => {
    if (!workout) return;
    const idx = g.sets.length;
    const same = last?.sets[idx];
    const prefill = same ?? g.sets[g.sets.length - 1] ?? last?.sets[last.sets.length - 1];
    // New sets are working sets unless last session had a warm-up / drop set in this position.
    await addSet(api, workout.id, g.exercise.id, prefill?.reps ?? 0, prefill?.weight_kg ?? 0, same?.kind ?? 'normal');
    await refreshGroups();
  };

  const patchSet = (set: WorkoutSet, patch: Partial<WorkoutSet>) =>
    setGroups((prev) =>
      prev.map((g) =>
        g.exercise.id !== set.exercise_id
          ? g
          : { ...g, sets: g.sets.map((s) => (s.id === set.id ? { ...s, ...patch } : s)) }
      )
    );

  useFocusEffect(
    useCallback(() => {
      const edits = pending.current;
      return () => {
        flushEdits(api, edits);
      };
    }, [api])
  );

  const onChangeSet = (set: WorkoutSet, reps: number, weightKg: number) => {
    patchSet(set, { reps, weight_kg: weightKg });
    // Typing sends one request per keystroke otherwise (and they could arrive out of order).
    const p = pending.current;
    clearTimeout(p.get(set.id)?.timer);
    p.set(set.id, { reps, weightKg, timer: setTimeout(() => saveEdit(api, p, set.id), 500) });
  };

  const onChangeKind = (set: WorkoutSet, kind: SetKind) => {
    patchSet(set, { kind });
    track(setSetKind(api, set.id, kind));
  };

  const onToggleDone = (set: WorkoutSet) => {
    const done = set.done !== 1;
    if (done && set.reps <= 0) {
      notify('Enter reps first', 'Type how many reps you did before ticking the set.');
      return;
    }
    Keyboard.dismiss();
    haptic.tap();
    patchSet(set, { done: done ? 1 : 0 });
    track(setSetDone(api, set.id, done));

    // Ticking the last set of an exercise moves on to the next exercise that still has sets to do.
    const index = groups.findIndex((g) => g.exercise.id === set.exercise_id);
    const finishedExercise = done && index >= 0 && groups[index].sets.every((s) => s.id === set.id || s.done === 1);
    const undone = (g: WorkoutExercise) => g.sets.some((s) => s.done !== 1 && s.id !== set.id);
    const next = finishedExercise
      ? (groups.slice(index + 1).find(undone) ?? groups.slice(0, index).find(undone))
      : undefined;
    if (finishedExercise) {
      haptic.success();
      // After the tick re-renders, so the layout is current.
      setTimeout(() => {
        const y = next ? cardY.current.get(next.exercise.id) : finishY.current;
        if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
      }, 150);
    }

    if (done && restSeconds > 0) {
      setRest({
        endsAt: msFromNow(restSeconds * 1000),
        total: restSeconds * 1000,
        next: finishedExercise ? (next ? next.exercise.name : 'Finish workout') : undefined,
      });
    }
  };

  const adjustRest = useCallback(
    (delta: number) =>
      setRest((r) => {
        if (!r) return r;
        const endsAt = Math.max(Date.now(), r.endsAt + delta);
        return { endsAt, total: Math.max(r.total + delta, endsAt - Date.now(), 1) };
      }),
    []
  );
  const closeRest = useCallback(() => setRest(null), []);

  // Removed from the screen at once; put back (by reloading) if the server says no.
  const onDeleteSet = (set: WorkoutSet) =>
    confirm(
      'Delete set?',
      'Delete this set?',
      'Delete',
      () => {
        pending.current.delete(set.id);
        setGroups((prev) => prev.map((g) => ({ ...g, sets: g.sets.filter((s) => s.id !== set.id) })));
        deleteSet(api, set)
          .then(refreshGroups)
          .catch((e) => {
            reportError(e, 'Couldn’t delete the set');
            refreshGroups().catch(() => {});
          });
      },
      { destructive: true }
    );

  const onRemoveExercise = (g: WorkoutExercise) => {
    if (!workout) return;
    confirm(
      'Remove exercise?',
      `Remove ${g.exercise.name} and its sets from this workout?`,
      'Remove',
      () => {
        setGroups((prev) => prev.filter((x) => x.exercise.id !== g.exercise.id));
        removeExerciseFromWorkout(api, workout.id, g.exercise.id).catch((e) => {
          reportError(e, `Couldn’t remove ${g.exercise.name}`);
          refreshGroups().catch(() => {});
        });
      },
      { destructive: true }
    );
  };

  const onFinish = async () => {
    if (!workout) return;
    Keyboard.dismiss();
    // The screen already has every set's ticked state (changes are applied here as they're sent).
    const undone = groups.reduce((n, g) => n + g.sets.filter((s) => s.done !== 1).length, 0);
    const msg =
      undone > 0
        ? `${undone} set${undone > 1 ? 's are' : ' is'} not ticked ✓ and will be removed. Save the rest to history?`
        : 'Great work! Save this workout to your history.';
    const done = groups.flatMap((g) => g.sets).filter((s) => s.done === 1);
    const summary = [
      formatDuration(msSince(workout.date)),
      `${groups.filter((g) => g.sets.some((s) => s.done === 1)).length} exercises`,
      `${done.length} sets`,
      `${Math.round(toDisplay(done.reduce((v, s) => v + setVolume(s), 0), unit)).toLocaleString()} ${unit} lifted`,
    ].join(' · ');
    confirm(
      'Finish workout?',
      msg,
      'Finish',
      () =>
        run('Saving workout…', async () => {
          await Promise.all([flushEdits(api, pending.current), ...inFlight.current]);
          const saved = await finishWorkout(api, workout.id);
          if (saved) {
            haptic.success();
            notify('Workout saved 🎉', summary);
          } else notify('Nothing logged', 'No sets were ticked, so the workout was discarded.');
        }),
      { cancelText: 'Keep going' }
    );
  };

  const onDiscard = () => {
    if (!workout) return;
    confirm(
      'Discard workout?',
      'All sets in this workout will be deleted.',
      'Discard',
      () => run('Discarding…', () => deleteWorkout(api, workout.id)),
      { destructive: true }
    );
  };

  const overlay = busy ? (
    <View style={styles.overlay} accessibilityLiveRegion="polite">
      <View style={styles.overlayBox}>
        <ActivityIndicator color={theme.accent} size="large" />
        <Text style={styles.overlayText}>{busy}</Text>
      </View>
    </View>
  ) : null;

  if (status !== 'ready') {
    return (
      <View style={styles.container}>
        <ScreenHeader subtitle={greeting()} title="Let's train 💪" />
        {status === 'loading' ? <Loading /> : <LoadError message={error} onRetry={retry} />}
      </View>
    );
  }

  // ---------- Idle: dashboard ----------
  if (!workout) {
    return (
      <View style={styles.container}>
        <ScreenHeader subtitle={greeting()} title="Let's train 💪" />
        <ScrollView contentContainerStyle={styles.scroll} refreshControl={refreshControl}>
          {plans.map((p) => {
            const next = p.days.find((d) => d.id === p.nextDayId);
            return (
              <View key={p.id} style={styles.planCard}>
                <LinearGradient
                  colors={['#1f2a0a', '#141a08', theme.card]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.planHero}>
                  <View style={styles.planTop}>
                    <Text style={styles.heroKicker}>{p.name.toUpperCase()}</Text>
                    <Pressable
                      hitSlop={8}
                      onPress={() => router.push({ pathname: '/routine/[id]', params: { id: String(p.id) } })}>
                      <Text style={styles.edit}>Edit</Text>
                    </Pressable>
                  </View>
                  {next ? (
                    <>
                      <Text style={styles.nextLabel}>Next up</Text>
                      <Text style={styles.heroTitle}>{next.name}</Text>
                      <Text style={styles.heroSub} numberOfLines={2}>
                        {next.exercises.map((e) => e.name).join(' · ') || 'No exercises yet'}
                      </Text>
                      <Button
                        title={`Start ${next.name}`}
                        icon="▶"
                        size="lg"
                        onPress={() => onStartDay(next.id)}
                        style={{ marginTop: 16 }}
                      />
                    </>
                  ) : (
                    <Text style={styles.heroSub}>Add days to this plan to start training.</Text>
                  )}
                </LinearGradient>
                {p.days.length > 1 && (
                  <View style={styles.dayChips}>
                    {p.days
                      .filter((d) => d.id !== p.nextDayId)
                      .map((d) => (
                        <Pressable
                          key={d.id}
                          accessibilityRole="button"
                          accessibilityLabel={`Start ${d.name}`}
                          disabled={!!busy}
                          style={({ pressed }) => [styles.dayChip, pressed && { opacity: 0.7 }]}
                          onPress={() => onStartDay(d.id)}>
                          <Text style={styles.dayChipText}>▶ {d.name}</Text>
                        </Pressable>
                      ))}
                  </View>
                )}
              </View>
            );
          })}

          {plans.length === 0 && (
            <LinearGradient
              colors={['#1f2a0a', '#141a08', theme.card]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.planHero}>
              <Text style={styles.heroKicker}>GET ORGANISED</Text>
              <Text style={styles.heroTitle}>Create your training plan</Text>
              <Text style={styles.heroSub}>
                Split your exercises into days, like an Arnold Split or Upper / Lower, then start a day with one tap.
              </Text>
              <Button title="Set up a plan" icon="+" size="lg" onPress={() => router.push('/plans')} style={{ marginTop: 16 }} />
            </LinearGradient>
          )}

          <Button title="Start empty workout" variant="secondary" onPress={onStartEmpty} style={{ marginTop: 12 }} />

          <Text style={styles.section}>Your progress</Text>
          <View style={styles.statsRow}>
            <StatTile value={String(stats?.thisWeek ?? 0)} label="This week" color={theme.accent} />
            <StatTile value={`${stats?.streakWeeks ?? 0} 🔥`} label="Week streak" color={theme.gold} />
          </View>
          <View style={[styles.statsRow, { marginTop: 10 }]}>
            <StatTile value={String(stats?.total ?? 0)} label="Total workouts" />
            <StatTile
              value={`${compact(toDisplay(stats?.weekVolume ?? 0, unit))}`}
              label={`${unit} lifted this week`}
            />
          </View>
          {stats?.lastDate ? (
            <Text style={styles.lastNote}>Last workout · {formatShortDate(stats.lastDate)}</Text>
          ) : null}
        </ScrollView>
        {overlay}
      </View>
    );
  }

  // ---------- Active workout ----------
  const allSets = groups.flatMap((g) => g.sets);
  const doneSets = allSets.filter((s) => s.done === 1);
  const volume = doneSets.reduce((b, s) => b + setVolume(s), 0);
  const progress = allSets.length ? doneSets.length / allSets.length : 0;

  return (
    <View style={styles.container}>
      <ScreenHeader
        subtitle="Workout in progress"
        title={workout.title || 'Today'}
        right={
          <View style={styles.timerBox}>
            <View style={styles.liveDot} />
            <WorkoutTimer start={workout.date} style={styles.timer} />
          </View>
        }
      />
      <View style={styles.summary}>
        <Summary value={String(groups.length)} label="Exercises" />
        <View style={styles.divider} />
        <Summary value={`${doneSets.length}/${allSets.length}`} label="Sets done" />
        <View style={styles.divider} />
        <Summary value={`${compact(toDisplay(volume, unit))}`} label={`Volume (${unit})`} />
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scroll, rest && { paddingBottom: 140 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets
        refreshControl={refreshControl}>
        {groups.length === 0 && adding.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🏋️</Text>
            <Text style={styles.emptyTitle}>No exercises yet</Text>
            <Text style={styles.emptySub}>Add your first exercise to begin logging sets.</Text>
            <Button title="Add exercise" icon="+" onPress={() => setPicker(true)} style={{ marginTop: 10, minWidth: 200 }} />
          </View>
        )}
        {groups.map((g) => (
          <View key={g.exercise.id} onLayout={(e) => cardY.current.set(g.exercise.id, e.nativeEvent.layout.y)}>
          <ExerciseCard
            workoutId={workout.id}
            group={g}
            unit={unit}
            onAddSet={(last) => onAddSet(g, last)}
            onChangeSet={onChangeSet}
            onToggleDone={onToggleDone}
            onDeleteSet={onDeleteSet}
            onChangeKind={onChangeKind}
            onRemove={() => onRemoveExercise(g)}
          />
          </View>
        ))}
        {adding.map((ex) => (
          <View key={ex.id} style={styles.addingCard}>
            <ActivityIndicator color={theme.accent} />
            <Text style={styles.addingText}>Adding {ex.name}…</Text>
          </View>
        ))}
        {groups.length > 0 && (
          <Text style={styles.hint}>Tap ✓ when you finish a set · tap the set number to mark it as warm-up (W) or drop set (D)</Text>
        )}
        {groups.length > 0 && (
          <Button title="Add exercise" icon="+" variant="ghost" onPress={() => setPicker(true)} />
        )}
        <View onLayout={(e) => (finishY.current = e.nativeEvent.layout.y)}>
          <Button title="Finish workout" icon="✓" size="lg" onPress={onFinish} style={{ marginTop: 24 }} />
        </View>
        <Button title="Discard workout" variant="danger" onPress={onDiscard} style={{ marginTop: 10 }} />
      </ScrollView>
      {rest && <RestTimer rest={rest} onAdjust={adjustRest} onClose={closeRest} />}
      <ExercisePicker visible={picker} onClose={() => setPicker(false)} onPick={onPick} />
      {overlay}
    </View>
  );
}

function Summary({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={styles.sumValue}>{value}</Text>
      <Text style={styles.sumLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  scroll: { padding: 16, paddingBottom: 60 },
  planCard: { marginBottom: 14 },
  planHero: {
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(198,255,61,0.25)',
  },
  planTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  edit: { color: theme.muted, fontWeight: '700', fontSize: 13 },
  heroKicker: { color: theme.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  nextLabel: { color: theme.muted, fontSize: 12, fontWeight: '700', marginTop: 10 },
  heroTitle: { color: theme.text, fontSize: 26, fontWeight: '800', marginTop: 2 },
  heroSub: { color: theme.muted, fontSize: 13, marginTop: 6, lineHeight: 19 },
  dayChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  dayChip: {
    backgroundColor: theme.card,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: theme.border,
  },
  dayChipText: { color: theme.text, fontWeight: '700', fontSize: 13 },
  section: {
    color: theme.muted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 26,
    marginBottom: 10,
  },
  statsRow: { flexDirection: 'row', gap: 10 },
  lastNote: { color: theme.faint, textAlign: 'center', marginTop: 18, fontSize: 13 },
  timerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.card,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 4,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.accent },
  timer: { color: theme.text, fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
  summary: {
    flexDirection: 'row',
    marginHorizontal: 16,
    backgroundColor: theme.card,
    borderRadius: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  progressTrack: {
    height: 4,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 2,
    backgroundColor: theme.cardAlt,
    overflow: 'hidden',
  },
  progressFill: { height: 4, backgroundColor: theme.success, borderRadius: 2 },
  divider: { width: 1, backgroundColor: theme.border },
  sumValue: { color: theme.text, fontSize: 20, fontWeight: '800' },
  sumLabel: { color: theme.muted, fontSize: 11, marginTop: 2 },
  hint: { color: theme.faint, fontSize: 12, textAlign: 'center', marginBottom: 12 },
  empty: { alignItems: 'center', paddingVertical: 36 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { color: theme.text, fontSize: 18, fontWeight: '800', marginTop: 10 },
  emptySub: { color: theme.muted, marginTop: 4, marginBottom: 8, textAlign: 'center' },
  addingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.card,
    borderRadius: theme.radius,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: theme.border,
    borderStyle: 'dashed',
  },
  addingText: { color: theme.muted, fontSize: 15, fontWeight: '700' },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10,11,15,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayBox: {
    backgroundColor: theme.card,
    borderRadius: 18,
    paddingVertical: 22,
    paddingHorizontal: 30,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  overlayText: { color: theme.text, fontSize: 15, fontWeight: '700' },
});
