import { useCallback, useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { useApi, type Api } from '@/src/api/SessionContext';
import { ExerciseVideos } from '@/src/components/ExerciseVideos';
import { RestTimer } from '@/src/components/RestTimer';
import { Arrow, Button, DetailState, Pill } from '@/src/components/ui';
import {
  addExerciseVideo,
  addSet,
  deleteExerciseVideo,
  getActiveWorkout,
  getExerciseHistory,
  getExerciseVideos,
  getWorkoutExercises,
  setSetDone,
  setSetKind,
  updateSet,
  type ExerciseSession,
  type ExerciseVideo,
  type SetKind,
  type VideoSource,
  type Workout,
  type WorkoutExercise,
  type WorkoutSet,
} from '@/src/db/queries';
import { rest as restTimer, useRest } from '@/src/hooks/useRest';
import { alpha, groupColor, theme } from '@/src/theme';
import { useUnit } from '@/src/UnitContext';
import { notify } from '@/src/utils/confirm';
import { haptic, reportError } from '@/src/utils/feedback';
import { formatShortDate, fromDisplay, toDisplay, type Unit } from '@/src/utils/format';
import { kindInfo, kindOrdinals, setLabels } from '@/src/utils/setKind';
import { deleteVideoFile } from '@/src/utils/videoFiles';
import { isRTL, plural, t } from '@/src/i18n';

const NEXT_KIND: Record<SetKind, SetKind> = { normal: 'warmup', warmup: 'drop', drop: 'normal' };

/** Weight / reps typed but not sent yet, per set id. */
type PendingEdits = Map<string, { reps: number; weightKg: number; timer: ReturnType<typeof setTimeout> }>;

function saveEdit(api: Api, pending: PendingEdits, setId: string) {
  const e = pending.get(setId);
  if (!e) return Promise.resolve();
  clearTimeout(e.timer);
  pending.delete(setId);
  return updateSet(api, setId, e.reps, e.weightKg).catch(reportError);
}

const flushEdits = (api: Api, pending: PendingEdits) =>
  Promise.all([...pending.keys()].map((id) => saveEdit(api, pending, id)));

/**
 * Training one exercise of the workout in progress: its videos, then one set at a time
 * (type from the plan, weight, reps, ✓ Done). Done moves to the next set and starts the rest
 * timer; after the last set it moves on to the next exercise, after the last exercise to Finish.
 */
export default function TrainExercise() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const { unit, restSeconds } = useUnit();
  const rest = useRest();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [groups, setGroups] = useState<WorkoutExercise[]>([]);
  const [videos, setVideos] = useState<ExerciseVideo[]>([]);
  // The last finished sessions of this exercise (newest first), at most 3.
  const [recent, setRecent] = useState<ExerciseSession[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading');
  // The set shown in the big card (null = the first set not done yet).
  const [currentId, setCurrentId] = useState<string | null>(null);
  const pending = useRef<PendingEdits>(new Map());
  const inFlight = useRef(new Set<Promise<unknown>>());
  const track = (p: Promise<unknown>) => {
    const q = p.catch(reportError).finally(() => inFlight.current.delete(q));
    inFlight.current.add(q);
  };

  const load = useCallback(async () => {
    try {
      const [w, v, h] = await Promise.all([getActiveWorkout(api), getExerciseVideos(api, id), getExerciseHistory(api, id)]);
      setVideos(v);
      setRecent(h.slice(0, 3));
      if (!w) return setStatus('missing');
      const g = await getWorkoutExercises(api, w.id, { context: true });
      setWorkout(w);
      setGroups(g);
      setStatus(g.some((x) => x.exercise.id === id) ? 'ready' : 'missing');
    } catch (e) {
      reportError(e);
    }
  }, [api, id]);

  useFocusEffect(
    useCallback(() => {
      load();
      const edits = pending.current;
      return () => {
        flushEdits(api, edits);
      };
    }, [load, api])
  );

  if (status !== 'ready' || !workout) {
    if (status === 'missing') {
      return (
        <View style={{ flex: 1, backgroundColor: theme.bg }}>
          <Stack.Screen options={{ title: t('Workout') }} />
          <DetailState missing what="exercise in your current workout" />
        </View>
      );
    }
    return <DetailState missing={false} what="exercise" />;
  }

  const index = groups.findIndex((g) => g.exercise.id === id);
  const group = groups[index];
  const { exercise, sets, last } = group;
  const labels = setLabels(sets);
  const ords = kindOrdinals(sets);
  const lastOrds = last ? kindOrdinals(last.sets) : [];
  const firstUndone = sets.find((s) => s.done !== 1);
  const current = sets.find((s) => s.id === currentId) ?? firstUndone ?? sets[sets.length - 1];
  const ci = current ? sets.indexOf(current) : -1;
  const prevFor = (i: number) =>
    last?.sets.find((p, j) => (p.kind ?? 'normal') === (sets[i].kind ?? 'normal') && lastOrds[j] === ords[i]);
  const undoneElsewhere = (g: WorkoutExercise) => g.sets.some((s) => s.done !== 1);
  const nextExercise =
    groups.slice(index + 1).find(undoneElsewhere) ?? groups.slice(0, index).find(undoneElsewhere);
  const color = groupColor(exercise.muscle_group);

  const patchSet = (setId: string, patch: Partial<WorkoutSet>) =>
    setGroups((prev) =>
      prev.map((g) => (g.exercise.id !== id ? g : { ...g, sets: g.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)) }))
    );

  const onChangeSet = (set: WorkoutSet, reps: number, weightKg: number) => {
    patchSet(set.id, { reps, weight_kg: weightKg });
    const p = pending.current;
    clearTimeout(p.get(set.id)?.timer);
    p.set(set.id, { reps, weightKg, timer: setTimeout(() => saveEdit(api, p, set.id), 500) });
  };

  const onKind = (set: WorkoutSet) => {
    const kind = NEXT_KIND[set.kind ?? 'normal'];
    patchSet(set.id, { kind });
    track(setSetKind(api, set.id, kind));
  };

  const go = (exerciseId: string) => router.replace({ pathname: '/train/[id]', params: { id: exerciseId } });

  const leave = async () => {
    await Promise.all([flushEdits(api, pending.current), ...inFlight.current]);
  };

  const onDone = async (set: WorkoutSet) => {
    Keyboard.dismiss();
    haptic.tap();
    patchSet(set.id, { done: 1 });
    track(setSetDone(api, set.id, true));

    const remaining = sets.filter((s) => s.id !== set.id && s.done !== 1);
    if (remaining.length) {
      // The next set after this one that isn't done (or the first one left).
      const after = sets.slice(ci + 1).find((s) => s.done !== 1) ?? remaining[0];
      setCurrentId(after.id);
      restTimer.start(restSeconds, {
        kind: 'set',
        title: exercise.name,
        detail: `${t('Set {n} of {total}', { n: sets.indexOf(after) + 1, total: sets.length })} · ${kindInfo(after.kind).label}`,
      });
      return;
    }
    // Exercise complete: on to the next exercise (or back to finish the workout).
    haptic.success();
    if (nextExercise) {
      const left = nextExercise.sets.filter((s) => s.done !== 1).length;
      restTimer.start(restSeconds, {
        kind: 'exercise',
        title: nextExercise.exercise.name,
        detail: `${plural(left, '1 set', '{n} sets')} · ${t(nextExercise.exercise.muscle_group)}`,
      });
    } else {
      restTimer.start(restSeconds, { kind: 'finish', title: t('Finish workout'), detail: t('All sets done 💪') });
    }
    await leave();
    setTimeout(() => {
      if (nextExercise) go(nextExercise.exercise.id);
      else {
        router.navigate('/');
        notify(t('All sets done 💪'), t('Tap "Finish workout" to save it to your history.'));
      }
    }, 450);
  };

  const onUndo = (set: WorkoutSet) => {
    patchSet(set.id, { done: 0 });
    track(setSetDone(api, set.id, false));
  };

  const onAddSet = async () => {
    const base = sets[sets.length - 1];
    await leave();
    await addSet(api, workout.id, id, base?.reps ?? 0, base?.weight_kg ?? 0, base?.kind === 'warmup' ? 'normal' : (base?.kind ?? 'normal'));
    const g = await getWorkoutExercises(api, workout.id, { context: true });
    setGroups(g);
    const added = g.find((x) => x.exercise.id === id)?.sets.at(-1);
    if (added) setCurrentId(added.id);
  };

  const onAddVideo = async (source: VideoSource, url: string, title: string) => {
    await addExerciseVideo(api, id, source, url, title);
    setVideos(await getExerciseVideos(api, id));
  };
  const onDeleteVideo = async (v: ExerciseVideo) => {
    await deleteExerciseVideo(api, v.id);
    if (v.source === 'file') deleteVideoFile(v.url);
    setVideos(await getExerciseVideos(api, id));
  };

  const doneCount = sets.filter((s) => s.done === 1).length;
  const isLastSetHere = current && sets.filter((s) => s.done !== 1 && s.id !== current.id).length === 0;
  // The last set just says "Done"; the rest screen then shows what comes next.
  const doneLabel = isLastSetHere ? t('Done') : t('Done · next set');

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <Stack.Screen
        options={{
          title: exercise.name,
          headerRight: () => (
            <Text style={styles.headerCount}>
              {index + 1} / {groups.length}
            </Text>
          ),
        }}
      />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets>
        <ExerciseVideos videos={videos} onAdd={onAddVideo} onDelete={onDeleteVideo} />

        <Text style={styles.name}>{exercise.name}</Text>
        <View style={styles.metaRow}>
          <Pill text={t(exercise.muscle_group)} color={color} />
          <Text style={styles.meta}>
            {t('Exercise {n} of {total}', { n: index + 1, total: groups.length })} ·{' '}
            {t('{done}/{total} sets done', { done: doneCount, total: sets.length })}
          </Text>
        </View>

        {/* Every set of this exercise: tap one to work on it. */}
        <View style={styles.chips}>
          {sets.map((s, i) => {
            const info = kindInfo(s.kind);
            const active = s.id === current?.id;
            const special = s.kind !== 'normal';
            return (
              <Pressable
                key={s.id}
                onPress={() => setCurrentId(s.id)}
                accessibilityRole="button"
                accessibilityLabel={`${info.label} ${labels[i]}${s.done === 1 ? `, ${t('Done')}` : ''}`}
                accessibilityState={{ selected: active }}
                style={[
                  styles.chip,
                  special && { borderColor: info.color + '88' },
                  s.done === 1 && styles.chipDone,
                  active && styles.chipActive,
                ]}>
                <Text style={[styles.chipText, special && { color: info.color }, active && { color: theme.onAccent }]}>
                  {s.done === 1 ? '✓' : labels[i]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {current ? (
          <SetCard
            key={current.id}
            set={current}
            label={labels[ci]}
            number={ci + 1}
            total={sets.length}
            prev={prevFor(ci)}
            unit={unit}
            doneLabel={doneLabel}
            onChange={(r, w) => onChangeSet(current, r, w)}
            onKind={() => onKind(current)}
            onDone={() => onDone(current)}
            onUndo={() => onUndo(current)}
            onPrev={ci > 0 ? () => setCurrentId(sets[ci - 1].id) : undefined}
            onNext={ci < sets.length - 1 ? () => setCurrentId(sets[ci + 1].id) : undefined}
          />
        ) : (
          <Text style={styles.meta}>{t('No sets yet — add one below.')}</Text>
        )}

        <Button title={t('Add set')} icon="+" variant="secondary" onPress={onAddSet} style={{ marginTop: 12 }} />

        <RecentSessions sessions={recent} unit={unit} />

        <View style={styles.navRow}>
          <Button
            title={t('Previous')}
            arrow="back"
            variant="secondary"
            disabled={index === 0}
            onPress={async () => {
              await leave();
              go(groups[index - 1].exercise.id);
            }}
            style={{ flex: 1 }}
          />
          <Button
            title={t('Next')}
            arrow="forward"
            variant="secondary"
            disabled={index === groups.length - 1}
            onPress={async () => {
              await leave();
              go(groups[index + 1].exercise.id);
            }}
            style={{ flex: 1 }}
          />
        </View>
        <View style={styles.linkRow}>
          <Pressable onPress={() => router.navigate('/')} hitSlop={8}>
            <Text style={styles.link}>{t('All exercises')}</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push({ pathname: '/exercise/[id]', params: { id } })}
            hitSlop={8}>
            <Text style={styles.link}>{t('History & records')}</Text>
          </Pressable>
        </View>
      </ScrollView>
      {rest && <RestTimer rest={rest} onAdjust={restTimer.adjust} onClose={restTimer.clear} />}
    </View>
  );
}

/** Your last (up to) 3 finished sessions of this exercise, to see your progress while training. */
function RecentSessions({ sessions, unit }: { sessions: ExerciseSession[]; unit: Unit }) {
  if (!sessions.length) return null;
  return (
    <View style={{ marginTop: 22 }}>
      <Text style={styles.sectionTitle}>
        {plural(sessions.length, 'Last session', 'Last {n} sessions')}
      </Text>
      {sessions.map((session) => {
        const labels = setLabels(session.sets);
        const work = session.sets.filter((x) => x.kind !== 'warmup');
        const top = Math.max(0, ...(work.length ? work : session.sets).map((x) => x.weight_kg));
        return (
          <View key={session.workoutId} style={styles.recentCard}>
            <View style={styles.recentTop}>
              <Text style={styles.recentDate}>{formatShortDate(session.date)}</Text>
              <Text style={styles.recentTopW}>
                {t('Top {w} {unit}', { w: toDisplay(top, unit), unit })}
              </Text>
            </View>
            {session.sets.map((x, i) => {
              const info = kindInfo(x.kind);
              const special = x.kind !== 'normal';
              return (
                <View key={x.id} style={styles.recentRow}>
                  <View style={[styles.recentBadge, special && { backgroundColor: info.color + '26' }]}>
                    <Text style={[styles.recentBadgeText, special && { color: info.color }]}>{labels[i]}</Text>
                  </View>
                  <Text style={styles.recentVal}>
                    {toDisplay(x.weight_kg, unit)} <Text style={styles.recentUnit}>{unit}</Text>
                  </Text>
                  <Text style={styles.recentVal}>
                    {x.reps} <Text style={styles.recentUnit}>{x.reps === 1 ? t('rep') : t('reps')}</Text>
                  </Text>
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

/** The set being worked on: type, last time, big weight / reps boxes with − / +, Done. */
function SetCard({
  set,
  label,
  number,
  total,
  prev,
  unit,
  doneLabel,
  onChange,
  onKind,
  onDone,
  onUndo,
  onPrev,
  onNext,
}: {
  set: WorkoutSet;
  label: string;
  number: number;
  total: number;
  prev?: WorkoutSet;
  unit: Unit;
  doneLabel: string;
  onChange: (reps: number, weightKg: number) => void;
  onKind: () => void;
  onDone: () => void;
  onUndo: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  // Today's weight and reps start at 0 (no hints), so a set is never saved with numbers you
  // didn't actually enter. A finished set shows what was saved. The planned weight is kept only
  // to tell a bodyweight set (no planned weight, 0 is fine) from a forgotten weight.
  const done = set.done === 1;
  const [plannedKg] = useState(() => (set.weight_kg > 0 ? set.weight_kg : (prev?.weight_kg ?? 0)));
  const [weight, setWeight] = useState(done ? String(toDisplay(set.weight_kg, unit)) : '0');
  const [reps, setReps] = useState(done ? String(set.reps) : '0');
  const info = kindInfo(set.kind);
  const step = unit === 'kg' ? 2.5 : 5;

  const commit = (w: string, r: string) => {
    const wN = Math.max(0, parseFloat(w.replace(',', '.')) || 0);
    const rN = Math.max(0, parseInt(r, 10) || 0);
    onChange(rN, fromDisplay(wN, unit));
  };
  const bumpWeight = (d: number) => {
    const v = Math.max(0, Math.round(((parseFloat(weight.replace(',', '.')) || 0) + d) * 10) / 10);
    const t = String(v);
    setWeight(t);
    commit(t, reps);
  };
  const bumpReps = (d: number) => {
    const v = Math.max(0, (parseInt(reps, 10) || 0) + d);
    const t = String(v);
    setReps(t);
    commit(weight, t);
  };

  return (
    <View style={[styles.card, done && styles.cardDone]}>
      <View style={styles.cardTop}>
        <Pressable onPress={onPrev} disabled={!onPrev} hitSlop={10} accessibilityLabel={t('Previous set')}>
          <Arrow dir="back" style={[styles.arrow, !onPrev && { opacity: 0.2 }]} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.setTitle}>
            {t('Set {n} of {total}', { n: number, total })}
          </Text>
          <Pressable
            onPress={onKind}
            accessibilityRole="button"
            accessibilityLabel={`${info.label}. ${t('Tap to change set type')}`}
            style={[styles.kind, { backgroundColor: info.color + '26', borderColor: info.color + '66' }]}>
            <Text style={[styles.kindText, { color: info.color }]}>
              {label} · {info.label}
            </Text>
          </Pressable>
        </View>
        <Pressable onPress={onNext} disabled={!onNext} hitSlop={10} accessibilityLabel={t('Next set')}>
          <Arrow style={[styles.arrow, !onNext && { opacity: 0.2 }]} />
        </Pressable>
      </View>

      <Text style={styles.lastTime}>
        {prev
          ? t('Last time: {w} {unit} × {reps} reps', { w: toDisplay(prev.weight_kg, unit), unit, reps: prev.reps })
          : t('First time for this set ✨')}
      </Text>

      <View style={styles.fields}>
        <Field
          label={t('WEIGHT ({unit})', { unit: unit.toUpperCase() })}
          value={weight}
          placeholder=""
          keyboardType="decimal-pad"
          onChangeText={(t) => {
            setWeight(t);
            commit(t, reps);
          }}
          onMinus={() => bumpWeight(-step)}
          onPlus={() => bumpWeight(step)}
        />
        <Field
          label={t('REPS')}
          value={reps}
          placeholder=""
          keyboardType="number-pad"
          onChangeText={(t) => {
            setReps(t);
            commit(weight, t);
          }}
          onMinus={() => bumpReps(-1)}
          onPlus={() => bumpReps(1)}
        />
      </View>

      {done ? (
        <View style={styles.doneRow}>
          <Text style={styles.doneText}>✓ {t('Done')}</Text>
          <Button title={t('Undo')} variant="secondary" onPress={onUndo} style={{ minWidth: 110 }} />
        </View>
      ) : (
        <Button
          title={doneLabel}
          icon="✓"
          size="lg"
          onPress={() => {
            // Weight may stay 0 only for bodyweight sets (no planned weight).
            if (!(parseFloat(weight.replace(',', '.')) > 0) && plannedKg > 0) {
              notify(t('Enter the weight'), t('Type the weight you used in this set, then tap Done.'));
              return;
            }
            if (!(parseInt(reps, 10) > 0)) {
              notify(t('Enter your reps'), t('Type how many reps you did in this set, then tap Done.'));
              return;
            }
            onDone();
          }}
          style={{ marginTop: 16 }}
        />
      )}
    </View>
  );
}

function Field({
  label,
  value,
  placeholder,
  keyboardType,
  onChangeText,
  onMinus,
  onPlus,
}: {
  label: string;
  value: string;
  placeholder: string;
  keyboardType: 'decimal-pad' | 'number-pad';
  onChangeText: (t: string) => void;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldRow}>
        <Pressable onPress={onMinus} style={styles.step} accessibilityRole="button" accessibilityLabel={`− ${label}`}>
          <Text style={styles.stepText}>−</Text>
        </Pressable>
        <TextInput
          style={styles.bigInput}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.faint}
          keyboardType={keyboardType}
          selectTextOnFocus
          accessibilityLabel={label}
        />
        <Pressable onPress={onPlus} style={styles.step} accessibilityRole="button" accessibilityLabel={`+ ${label}`}>
          <Text style={styles.stepText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerCount: { color: theme.muted, fontWeight: '800', fontSize: 15, marginRight: 8 },
  name: { color: theme.text, fontSize: 26, lineHeight: 32, fontWeight: '800', marginTop: 18 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' },
  meta: { color: theme.muted, fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  chip: {
    minWidth: 44,
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 10,
    backgroundColor: theme.card,
    borderWidth: 1.5,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipDone: { backgroundColor: alpha(theme.success, 0.14), borderColor: alpha(theme.success, 0.5) },
  chipActive: { backgroundColor: theme.fill, borderColor: theme.fill },
  chipText: { color: theme.text, fontWeight: '800', fontSize: 15 },
  card: {
    backgroundColor: theme.card,
    borderRadius: 20,
    padding: 16,
    marginTop: 14,
    borderWidth: 1,
    borderColor: theme.border,
  },
  cardDone: { borderColor: alpha(theme.success, 0.5) },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  arrow: { color: theme.text, fontSize: 40, fontWeight: '300', paddingHorizontal: 8, lineHeight: 44 },
  setTitle: { color: theme.text, fontSize: 20, fontWeight: '800' },
  kind: { marginTop: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1 },
  kindText: { fontWeight: '800', fontSize: 13 },
  lastTime: { color: theme.muted, textAlign: 'center', marginTop: 12, fontSize: 14 },
  fields: { flexDirection: 'row', gap: 12, marginTop: 14 },
  fieldLabel: { color: theme.faint, fontSize: 11, fontWeight: '800', letterSpacing: isRTL ? 0 : 0.8, textAlign: 'center', marginBottom: 6 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  step: {
    width: 38,
    height: 56,
    borderRadius: 12,
    backgroundColor: theme.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { color: theme.accent, fontSize: 24, fontWeight: '800' },
  bigInput: {
    flex: 1,
    minWidth: 0,
    height: 56,
    backgroundColor: theme.input,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: theme.border,
    color: theme.text,
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
  },
  doneRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  doneText: { color: theme.success, fontSize: 18, fontWeight: '800' },
  sectionTitle: {
    color: theme.muted,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: isRTL ? 0 : 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  recentCard: {
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.border,
  },
  recentTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  recentDate: { color: theme.text, fontWeight: '800' },
  recentTopW: { color: theme.accent, fontWeight: '700', fontSize: 13 },
  recentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, gap: 10 },
  recentBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: theme.input,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentBadgeText: { color: theme.text, fontWeight: '800', fontSize: 12 },
  recentVal: { flex: 1, color: theme.text, fontSize: 16, fontWeight: '800' },
  recentUnit: { color: theme.muted, fontSize: 12, fontWeight: '600' },
  navRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  linkRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18, paddingHorizontal: 4 },
  link: { color: theme.accent, fontWeight: '700', fontSize: 14 },
});
