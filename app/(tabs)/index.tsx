import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { ExerciseCard } from '@/src/components/ExerciseCard';
import { ExercisePicker } from '@/src/components/ExercisePicker';
import { Button, ScreenHeader, StatTile } from '@/src/components/ui';
import { WorkoutTimer } from '@/src/components/WorkoutTimer';
import {
  addSet,
  countUndoneSets,
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
import { useReloadOnSync, useSync } from '@/src/sync/SyncContext';
import { useUnit } from '@/src/UnitContext';
import { confirm, notify } from '@/src/utils/confirm';
import { formatShortDate, toDisplay } from '@/src/utils/format';
import { setVolume } from '@/src/utils/setKind';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function compact(n: number) {
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

export default function WorkoutScreen() {
  const db = useSQLiteContext();
  const { unit } = useUnit();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [groups, setGroups] = useState<WorkoutExercise[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [plans, setPlans] = useState<RoutineFull[]>([]);
  const [picker, setPicker] = useState(false);

  const load = useCallback(async () => {
    const w = await getActiveWorkout(db);
    setWorkout(w);
    setGroups(w ? await getWorkoutExercises(db, w.id) : []);
    if (!w) {
      setStats(await getDashboardStats(db));
      setPlans(await getRoutinesFull(db));
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  useReloadOnSync(load);
  const { sync } = useSync();

  const onStartEmpty = async () => {
    await startWorkout(db);
    await load();
  };

  const onStartDay = async (dayId: number) => {
    await startWorkoutFromDay(db, dayId);
    await load();
  };

  const onPick = async (ex: Exercise) => {
    if (!workout) return;
    setPicker(false);
    if (groups.some((g) => g.exercise.id === ex.id)) return;
    const last = await getLastSession(db, ex.id, workout.id);
    const first = last?.sets[0];
    await addSet(db, workout.id, ex.id, first?.reps ?? 0, first?.weight_kg ?? 0, first?.kind ?? 'normal');
    await load();
  };

  const onAddSet = async (g: WorkoutExercise, last: LastSession | null) => {
    if (!workout) return;
    const idx = g.sets.length;
    const same = last?.sets[idx];
    const prefill = same ?? g.sets[g.sets.length - 1] ?? last?.sets[last.sets.length - 1];
    // New sets are working sets unless last session had a warm-up / drop set in this position.
    await addSet(db, workout.id, g.exercise.id, prefill?.reps ?? 0, prefill?.weight_kg ?? 0, same?.kind ?? 'normal');
    await load();
  };

  const patchSet = (set: WorkoutSet, patch: Partial<WorkoutSet>) =>
    setGroups((prev) =>
      prev.map((g) =>
        g.exercise.id !== set.exercise_id
          ? g
          : { ...g, sets: g.sets.map((s) => (s.id === set.id ? { ...s, ...patch } : s)) }
      )
    );

  const onChangeSet = (set: WorkoutSet, reps: number, weightKg: number) => {
    patchSet(set, { reps, weight_kg: weightKg });
    updateSet(db, set.id, reps, weightKg);
  };

  const onChangeKind = (set: WorkoutSet, kind: SetKind) => {
    patchSet(set, { kind });
    setSetKind(db, set.id, kind);
  };

  const onToggleDone = (set: WorkoutSet) => {
    const done = set.done !== 1;
    if (done && set.reps <= 0) {
      notify('Enter reps first', 'Type how many reps you did before ticking the set.');
      return;
    }
    patchSet(set, { done: done ? 1 : 0 });
    setSetDone(db, set.id, done);
  };

  const onDeleteSet = (set: WorkoutSet) =>
    confirm('Delete set?', 'Delete this set?', 'Delete', async () => {
      await deleteSet(db, set);
      await load();
    }, { destructive: true });

  const onRemoveExercise = (g: WorkoutExercise) => {
    if (!workout) return;
    confirm(
      'Remove exercise?',
      `Remove ${g.exercise.name} and its sets from this workout?`,
      'Remove',
      async () => {
        await removeExerciseFromWorkout(db, workout.id, g.exercise.id);
        await load();
      },
      { destructive: true }
    );
  };

  const onFinish = async () => {
    if (!workout) return;
    const undone = await countUndoneSets(db, workout.id);
    const msg =
      undone > 0
        ? `${undone} set${undone > 1 ? 's are' : ' is'} not ticked ✓ and will be removed. Save the rest to history?`
        : 'Great work! Save this workout to your history.';
    confirm(
      'Finish workout?',
      msg,
      'Finish',
      async () => {
        const saved = await finishWorkout(db, workout.id);
        if (!saved) notify('Nothing logged', 'No sets were ticked, so the workout was discarded.');
        await load();
        sync();
      },
      { cancelText: 'Keep going' }
    );
  };

  const onDiscard = () => {
    if (!workout) return;
    confirm(
      'Discard workout?',
      'All sets in this workout will be deleted.',
      'Discard',
      async () => {
        await deleteWorkout(db, workout.id);
        await load();
      },
      { destructive: true }
    );
  };

  // ---------- Idle: dashboard ----------
  if (!workout) {
    return (
      <View style={styles.container}>
        <ScreenHeader subtitle={greeting()} title="Let's train 💪" />
        <ScrollView contentContainerStyle={styles.scroll}>
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
                        <Pressable key={d.id} style={styles.dayChip} onPress={() => onStartDay(d.id)}>
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

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {groups.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🏋️</Text>
            <Text style={styles.emptyTitle}>No exercises yet</Text>
            <Text style={styles.emptySub}>Add your first exercise to begin logging sets.</Text>
          </View>
        )}
        {groups.map((g) => (
          <ExerciseCard
            key={g.exercise.id}
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
        ))}
        <Text style={styles.hint}>Tap ✓ when you finish a set · tap the set number to mark it as warm-up (W) or drop set (D)</Text>
        <Button title="Add exercise" icon="+" variant="ghost" onPress={() => setPicker(true)} />
        <Button title="Finish workout" icon="✓" size="lg" onPress={onFinish} style={{ marginTop: 24 }} />
        <Button title="Discard workout" variant="danger" onPress={onDiscard} style={{ marginTop: 10 }} />
      </ScrollView>
      <ExercisePicker visible={picker} onClose={() => setPicker(false)} onPick={onPick} />
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
  emptySub: { color: theme.muted, marginTop: 4, marginBottom: 8 },
});
