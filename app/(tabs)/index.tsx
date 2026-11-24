import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useApi } from '@/src/api/SessionContext';

import { ExercisePicker } from '@/src/components/ExercisePicker';
import { RestTimer } from '@/src/components/RestTimer';
import { rest as restTimer, useRest } from '@/src/hooks/useRest';
import { Arrow, Button, LoadError, Loading, ScreenHeader, StatTile } from '@/src/components/ui';
import { useScreenData } from '@/src/hooks/useScreenData';
import { WorkoutTimer } from '@/src/components/WorkoutTimer';
import {
  addSet,
  deleteWorkout,
  finishWorkout,
  getActiveWorkout,
  getDashboardStats,
  getLastSession,
  getRoutinesFull,
  getWorkoutExercises,
  removeExerciseFromWorkout,
  startWorkout,
  startWorkoutFromDay,
  type DashboardStats,
  type Exercise,
  type RoutineFull,
  type Workout,
  type WorkoutExercise,
} from '@/src/db/queries';
import { alpha, groupColor, theme } from '@/src/theme';

import { useUnit } from '@/src/UnitContext';
import { confirm, notify } from '@/src/utils/confirm';
import { haptic, reportError } from '@/src/utils/feedback';
import { formatShortDate, toDisplay, type Unit } from '@/src/utils/format';
import { kindInfo, setLabels, setVolume } from '@/src/utils/setKind';
import { isRTL, plural, t } from '@/src/i18n';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return t('Good morning');
  if (h < 18) return t('Good afternoon');
  return t('Good evening');
}

/** Clock reads for tap handlers (kept out of the component so they are never part of rendering). */
const msSince = (t: number) => Date.now() - t;

function formatDuration(ms: number) {
  const min = Math.max(1, Math.round(ms / 60000));
  return min >= 60 ? t('{h}h {m}m', { h: Math.floor(min / 60), m: min % 60 }) : t('{n} min', { n: min });
}

function compact(n: number) {
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

export default function WorkoutScreen() {
  const api = useApi();
  const { unit } = useUnit();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [groups, setGroups] = useState<WorkoutExercise[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [plans, setPlans] = useState<RoutineFull[]>([]);
  const [picker, setPicker] = useState(false);
  // Exercises picked but not on the server yet (shown as placeholder cards).
  const [adding, setAdding] = useState<Exercise[]>([]);
  const rest = useRest();
  // Blocks the screen with a spinner while a whole-workout action runs (start, finish, discard).
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
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
      restTimer.clear();
      setStats(s);
      setPlans(p);
    }
  }, [api]);

  const { status, error, retry, refreshControl } = useScreenData(load);

  /** Reload only the current workout's exercises (after adding / removing sets). */
  const refreshGroups = async () => {
    if (!workout) return;
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

  const onStartEmpty = () => run(t('Starting workout…'), () => startWorkout(api));

  // A plan day opens straight on its first exercise.
  const onStartDay = (dayId: string) =>
    run(t('Starting workout…'), async () => {
      const workoutId = await startWorkoutFromDay(api, dayId);
      const first = (await getWorkoutExercises(api, workoutId))[0];
      if (first) router.push({ pathname: '/train/[id]', params: { id: first.exercise.id } });
    });

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
      reportError(e, t('Couldn’t add {name}', { name: ex.name }));
    } finally {
      setAdding((a) => a.filter((x) => x.id !== ex.id));
    }
  };

  const onRemoveExercise = (g: WorkoutExercise) => {
    if (!workout) return;
    confirm(
      t('Remove exercise?'),
      t('Remove {name} and its sets from this workout?', { name: g.exercise.name }),
      t('Remove'),
      () => {
        setGroups((prev) => prev.filter((x) => x.exercise.id !== g.exercise.id));
        removeExerciseFromWorkout(api, workout.id, g.exercise.id).catch((e) => {
          reportError(e, t('Couldn’t remove {name}', { name: g.exercise.name }));
          refreshGroups().catch(() => {});
        });
      },
      { destructive: true }
    );
  };

  const onFinish = async () => {
    if (!workout) return;
    // Sets are ticked in the training screen, which saves everything before coming back here.
    const undone = groups.reduce((n, g) => n + g.sets.filter((s) => s.done !== 1).length, 0);
    const msg =
      undone > 0
        ? plural(undone, '1 set is not done ✓ and will be removed. Save the rest to history?', '{n} sets are not done ✓ and will be removed. Save the rest to history?')
        : t('Great work! Save this workout to your history.');
    const done = groups.flatMap((g) => g.sets).filter((s) => s.done === 1);
    const summary = [
      formatDuration(msSince(workout.date)),
      plural(groups.filter((g) => g.sets.some((s) => s.done === 1)).length, '1 exercise', '{n} exercises'),
      plural(done.length, '1 set', '{n} sets'),
      t('{n} {unit} lifted', { n: Math.round(toDisplay(done.reduce((v, s) => v + setVolume(s), 0), unit)).toLocaleString(), unit }),
    ].join(' · ');
    confirm(
      t('Finish workout?'),
      msg,
      t('Finish'),
      () =>
        run(t('Saving workout…'), async () => {
          const saved = await finishWorkout(api, workout.id);
          if (saved) {
            haptic.success();
            notify(t('Workout saved 🎉'), summary);
          } else notify(t('Nothing logged'), t('No sets were done, so the workout was discarded.'));
        }),
      { cancelText: t('Keep going') }
    );
  };

  const onDiscard = () => {
    if (!workout) return;
    confirm(
      t('Discard workout?'),
      t('All sets in this workout will be deleted.'),
      t('Discard'),
      () => run(t('Discarding…'), () => deleteWorkout(api, workout.id)),
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
        <ScreenHeader subtitle={greeting()} title={t("Let's train 💪")} />
        {status === 'loading' ? <Loading /> : <LoadError message={error} onRetry={retry} />}
      </View>
    );
  }

  // ---------- Idle: dashboard ----------
  if (!workout) {
    return (
      <View style={styles.container}>
        <ScreenHeader subtitle={greeting()} title={t("Let's train 💪")} />
        <ScrollView contentContainerStyle={styles.scroll} refreshControl={refreshControl}>
          {plans.map((p) => {
            const next = p.days.find((d) => d.id === p.nextDayId);
            return (
              <View key={p.id} style={styles.planCard}>
                <LinearGradient
                  colors={[theme.heroFrom, theme.heroTo, theme.card]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.planHero}>
                  <View style={styles.planTop}>
                    <Text style={styles.heroKicker}>{p.name.toUpperCase()}</Text>
                    <Pressable
                      hitSlop={8}
                      onPress={() => router.push({ pathname: '/routine/[id]', params: { id: String(p.id) } })}>
                      <Text style={styles.edit}>{t('Edit')}</Text>
                    </Pressable>
                  </View>
                  {next ? (
                    <>
                      <Text style={styles.nextLabel}>{t('Next up')}</Text>
                      <Text style={styles.heroTitle}>{next.name}</Text>
                      <Text style={styles.heroSub} numberOfLines={2}>
                        {next.exercises.map((e) => e.name).join(' · ') || t('No exercises yet')}
                      </Text>
                      <Button
                        title={t('Start {name}', { name: next.name })}
                        icon="▶"
                        size="lg"
                        onPress={() => onStartDay(next.id)}
                        style={{ marginTop: 16 }}
                      />
                    </>
                  ) : (
                    <Text style={styles.heroSub}>{t('Add days to this plan to start training.')}</Text>
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
                          accessibilityLabel={t('Start {name}', { name: d.name })}
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
              colors={[theme.heroFrom, theme.heroTo, theme.card]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.planHero}>
              <Text style={styles.heroKicker}>{t('GET ORGANISED')}</Text>
              <Text style={styles.heroTitle}>{t('Create your training plan')}</Text>
              <Text style={styles.heroSub}>
                {t('Split your exercises into days, like an Arnold Split or Upper / Lower, then start a day with one tap.')}
              </Text>
              <Button title={t('Set up a plan')} icon="+" size="lg" onPress={() => router.push('/plans')} style={{ marginTop: 16 }} />
            </LinearGradient>
          )}

          <Button title={t('Start empty workout')} variant="secondary" onPress={onStartEmpty} style={{ marginTop: 12 }} />

          <Text style={styles.section}>{t('Your progress')}</Text>
          <View style={styles.statsRow}>
            <StatTile value={String(stats?.thisWeek ?? 0)} label={t('This week')} color={theme.accent} />
            <StatTile value={`${stats?.streakWeeks ?? 0} 🔥`} label={t('Week streak')} color={theme.gold} />
          </View>
          <View style={[styles.statsRow, { marginTop: 10 }]}>
            <StatTile value={String(stats?.total ?? 0)} label={t('Total workouts')} />
            <StatTile
              value={`${compact(toDisplay(stats?.weekVolume ?? 0, unit))}`}
              label={t('{unit} lifted this week', { unit })}
            />
          </View>
          {stats?.lastDate ? (
            <Text style={styles.lastNote}>{t('Last workout')} · {formatShortDate(stats.lastDate)}</Text>
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
  // The exercise to train next: the first one with sets still to do.
  const nextUp = groups.find((g) => g.sets.some((s) => s.done !== 1));
  const openTraining = (exerciseId: string) => router.push({ pathname: '/train/[id]', params: { id: exerciseId } });

  return (
    <View style={styles.container}>
      <ScreenHeader
        subtitle={t('Workout in progress')}
        title={workout.title || t('Today')}
        right={
          <View style={styles.timerBox}>
            <View style={styles.liveDot} />
            <WorkoutTimer start={workout.date} style={styles.timer} />
          </View>
        }
      />
      <View style={styles.summary}>
        <Summary value={String(groups.length)} label={t('Exercises')} />
        <View style={styles.divider} />
        <Summary value={`${doneSets.length}/${allSets.length}`} label={t('Sets done')} />
        <View style={styles.divider} />
        <Summary value={`${compact(toDisplay(volume, unit))}`} label={t('Volume ({unit})', { unit })} />
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={refreshControl}>
        {nextUp && (
          <Button
            title={doneSets.length ? t('Continue: {name}', { name: nextUp.exercise.name }) : t('Start training')}
            icon="▶"
            size="lg"
            onPress={() => openTraining(nextUp.exercise.id)}
            style={{ marginBottom: 14 }}
          />
        )}
        {groups.length > 0 && !nextUp && (
          <Text style={styles.allDone}>{t('All sets done 💪 Tap “Finish workout” below to save it.')}</Text>
        )}
        {groups.length === 0 && adding.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🏋️</Text>
            <Text style={styles.emptyTitle}>{t('No exercises yet')}</Text>
            <Text style={styles.emptySub}>{t('Add your first exercise to begin logging sets.')}</Text>
            <Button title={t('Add exercise')} icon="+" onPress={() => setPicker(true)} style={{ marginTop: 10, minWidth: 200 }} />
          </View>
        )}
        {groups.map((g, i) => (
          <ExerciseRow
            key={g.exercise.id}
            index={i}
            group={g}
            unit={unit}
            onOpen={() => openTraining(g.exercise.id)}
            onRemove={() => onRemoveExercise(g)}
          />
        ))}
        {adding.map((ex) => (
          <View key={ex.id} style={styles.addingCard}>
            <ActivityIndicator color={theme.accent} />
            <Text style={styles.addingText}>{t('Adding {name}…', { name: ex.name })}</Text>
          </View>
        ))}
        {groups.length > 0 && <Text style={styles.hint}>{t('Tap an exercise to train it set by set.')}</Text>}
        {groups.length > 0 && (
          <Button title={t('Add exercise')} icon="+" variant="ghost" onPress={() => setPicker(true)} />
        )}
        <Button
          title={t('Finish workout')}
          icon="✓"
          size="lg"
          variant={nextUp ? 'secondary' : 'primary'}
          onPress={onFinish}
          style={{ marginTop: 24 }}
        />
        <Button title={t('Discard workout')} variant="danger" onPress={onDiscard} style={{ marginTop: 10 }} />
      </ScrollView>
      {rest && <RestTimer rest={rest} onAdjust={restTimer.adjust} onClose={restTimer.clear} />}
      <ExercisePicker visible={picker} onClose={() => setPicker(false)} onPick={onPick} />
      {overlay}
    </View>
  );
}

/** One exercise of the workout: its sets at a glance; tap to open the training screen. */
function ExerciseRow({
  index,
  group,
  unit,
  onOpen,
  onRemove,
}: {
  index: number;
  group: WorkoutExercise;
  unit: Unit;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const { exercise, sets } = group;
  const labels = setLabels(sets);
  const done = sets.filter((s) => s.done === 1).length;
  const complete = sets.length > 0 && done === sets.length;
  // The row opens the training screen; ✕ is a separate button next to it (not nested inside).
  return (
    <View
      style={[styles.exRow, { borderLeftColor: groupColor(exercise.muscle_group) }, complete && styles.exRowDone]}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${exercise.name}, ${t('{done}/{total} sets done', { done, total: sets.length })}`}
        style={({ pressed }) => [styles.exMain, pressed && { opacity: 0.75 }]}>
      <View style={styles.exHead}>
        <Text style={styles.exIndex}>{index + 1}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.exName} numberOfLines={2}>
            {exercise.name}
          </Text>
          <Text style={[styles.exMeta, complete && { color: theme.success, fontWeight: '800' }]}>
            {complete ? `✓ ${t('Done')}` : t('{done}/{total} sets done', { done, total: sets.length })} · {t(exercise.muscle_group)}
          </Text>
        </View>
        <Arrow style={styles.chev} />
      </View>
      <View style={styles.miniChips}>
        {sets.map((st, i) => {
          const info = kindInfo(st.kind);
          return (
            <View key={st.id} style={[styles.miniChip, st.done === 1 && styles.miniChipDone]}>
              <Text style={[styles.miniChipText, st.kind !== 'normal' && { color: info.color }]}>
                {st.done === 1 ? '✓ ' : ''}
                {labels[i]} · {toDisplay(st.weight_kg, unit)} {unit} × {st.reps}
              </Text>
            </View>
          );
        })}
      </View>
      </Pressable>
      <Pressable
        onPress={onRemove}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={t('Remove {name} from workout', { name: exercise.name })}
        style={styles.removeBtn}>
        <Text style={styles.removeText}>✕</Text>
      </Pressable>
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
    borderColor: alpha(theme.accent, 0.25),
  },
  planTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  edit: { color: theme.muted, fontWeight: '700', fontSize: 13 },
  heroKicker: { color: theme.accent, fontSize: 12, fontWeight: '800', letterSpacing: isRTL ? 0 : 1.5 },
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
    letterSpacing: isRTL ? 0 : 1,
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
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.fill },
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
  allDone: { color: theme.success, fontWeight: '800', fontSize: 15, textAlign: 'center', marginBottom: 14 },
  exRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: theme.card,
    borderRadius: theme.radius,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.border,
    borderLeftWidth: 4,
  },
  exRowDone: { borderColor: alpha(theme.success, 0.45) },
  exMain: { flex: 1 },
  exHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  exIndex: { color: theme.faint, fontWeight: '800', fontSize: 15, width: 18, textAlign: 'center' },
  exName: { color: theme.text, fontSize: 17, fontWeight: '800' },
  exMeta: { color: theme.muted, fontSize: 12, marginTop: 3 },
  removeBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: theme.cardAlt, alignItems: 'center', justifyContent: 'center' },
  removeText: { color: theme.muted, fontWeight: '700' },
  chev: { color: theme.faint, fontSize: 26, marginLeft: 2 },
  miniChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, marginLeft: 28 },
  miniChip: { backgroundColor: theme.cardAlt, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  miniChipDone: { backgroundColor: alpha(theme.success, 0.14) },
  miniChipText: { color: theme.text, fontSize: 12, fontWeight: '700' },
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
    backgroundColor: alpha(theme.bg, 0.6),
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
