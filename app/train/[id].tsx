import { useCallback, useRef, useState } from 'react';
import { Keyboard, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { useApi, type Api } from '@/src/api/SessionContext';
import { ExerciseVideos } from '@/src/components/ExerciseVideos';
import { RestTimer } from '@/src/components/RestTimer';
import { Arrow, Button, DetailState, Pill } from '@/src/components/ui';
import {
  addExerciseVideo,
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
import { cleanNumber, parseNumber } from '@/src/utils/number';
import { parseYouTube } from '@/src/utils/youtube';
import { kindInfo, kindOrdinals, setLabels } from '@/src/utils/setKind';
import { deleteVideoFile } from '@/src/utils/videoFiles';
import { isRTL, plural, t } from '@/src/i18n';

const NEXT_KIND: Record<SetKind, SetKind> = { normal: 'warmup', warmup: 'drop', drop: 'normal' };

/** Opens a set's YouTube link outside the app (YouTube app if installed, else the browser). */
function openLink(url: string) {
  if (!parseYouTube(url)) return;
  const full = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  Linking.openURL(full).catch(reportError);
}

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
  const { unit, setUnit, restSeconds } = useUnit();
  const rest = useRest();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [groups, setGroups] = useState<WorkoutExercise[]>([]);
  const [videos, setVideos] = useState<ExerciseVideo[]>([]);
  // The last finished sessions of this exercise (newest first), at most 3.
  const [recent, setRecent] = useState<ExerciseSession[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'none'>('loading');
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
      if (!w) return setStatus('none');
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
    if (status === 'missing' || status === 'none') {
      return (
        <View style={{ flex: 1, backgroundColor: theme.bg }}>
          <Stack.Screen options={{ title: t('Workout') }} />
          {status === 'none' ? (
            <DetailState
              missing
              what="workout"
              title={t('No workout in progress')}
              sub={t('This workout was finished or discarded. Finished workouts are in History and can’t be edited.')}
            />
          ) : (
            <DetailState
              missing
              what="exercise"
              title={t('Not in this workout')}
              sub={t('This exercise was removed from your current workout.')}
            />
          )}
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
        detail: [
          t('Set {n} of {total}', { n: sets.indexOf(after) + 1, total: sets.length }),
          kindInfo(after.kind).label,
          after.note,
        ]
          .filter(Boolean)
          .join(' · '),
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
              {/* The LRM mark keeps "2 / 6" in this order in Arabic (it showed as "6 / 2"). */}
              {`‎${index + 1} / ${groups.length}`}
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
            link={current.link || exercise.technique_links?.[current.kind] || ''}
            label={labels[ci]}
            number={ci + 1}
            total={sets.length}
            prev={prevFor(ci)}
            unit={unit}
            doneLabel={doneLabel}
            onChange={(r, w) => onChangeSet(current, r, w)}
            onUnit={(u) => setUnit(u).catch(reportError)}
            onKind={() => onKind(current)}
            onDone={() => onDone(current)}
            onUndo={() => onUndo(current)}
            onPrev={ci > 0 ? () => setCurrentId(sets[ci - 1].id) : undefined}
            onNext={ci < sets.length - 1 ? () => setCurrentId(sets[ci + 1].id) : undefined}
          />
        ) : (
          <Text style={styles.meta}>{t('No sets planned for this exercise. Add sets in the plan.')}</Text>
        )}
        {/* Sets are added only in the plan editor, not during training. */}

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

/** The set being worked on: type, last time, weight × reps boxes, Done (or Edit for a finished set). */
function SetCard({
  set,
  link,
  label,
  number,
  total,
  prev,
  unit,
  doneLabel,
  onChange,
  onUnit,
  onKind,
  onDone,
  onUndo,
  onPrev,
  onNext,
}: {
  set: WorkoutSet;
  /** The set's own YouTube link from the plan, else the exercise's video for this set type. */
  link: string;
  label: string;
  number: number;
  total: number;
  prev?: WorkoutSet;
  unit: Unit;
  doneLabel: string;
  onChange: (reps: number, weightKg: number) => void;
  onUnit: (u: Unit) => void;
  onKind: () => void;
  onDone: () => void;
  onUndo: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  // Today's weight and reps start empty (the box shows its label), so a set is never saved with
  // numbers you didn't actually enter. A finished set shows what was saved and stays locked until
  // you tap Edit. The planned weight is kept only to tell a bodyweight set (no planned weight,
  // empty is fine) from a forgotten weight.
  const done = set.done === 1;
  const [editing, setEditing] = useState(false);
  const locked = done && !editing;
  const [plannedKg] = useState(() => (set.weight_kg > 0 ? set.weight_kg : (prev?.weight_kg ?? 0)));
  const [weight, setWeight] = useState(done ? String(toDisplay(set.weight_kg, unit)) : '');
  const [reps, setReps] = useState(done ? String(set.reps) : '');
  const info = kindInfo(set.kind);

  const commit = (w: string, r: string) => onChange(Math.round(parseNumber(r)), fromDisplay(parseNumber(w), unit));

  // Switching kg / lb converts the number already in the box.
  const switchUnit = (u: Unit) => {
    if (u === unit) return;
    if (weight) setWeight(String(toDisplay(fromDisplay(parseNumber(weight), unit), u)));
    onUnit(u);
  };

  // Weight may stay empty only for bodyweight sets (no planned weight); reps are always needed.
  const valid = () => {
    if (!(parseNumber(weight) > 0) && plannedKg > 0) {
      notify(t('Enter the weight'), t('Type the weight you used in this set, then tap Done.'));
      return false;
    }
    if (!(parseNumber(reps) > 0)) {
      notify(t('Enter your reps'), t('Type how many reps you did in this set, then tap Done.'));
      return false;
    }
    return true;
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
            disabled={locked}
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

      {set.kind !== 'normal' || set.note ? (
        <View style={[styles.tip, { borderColor: alpha(info.color, 0.45), backgroundColor: alpha(info.color, 0.1) }]}>
          {/* Short on purpose: just what kind of set this is. */}
          {set.kind === 'warmup' ? (
            <Text style={[styles.tipText, { color: info.color }]}>{t('Warm-up set only')}</Text>
          ) : set.kind === 'drop' ? (
            <Text style={[styles.tipText, { color: info.color }]}>{t('Drop set')}</Text>
          ) : null}
          {set.note ? <Text style={styles.tipNote}>📝 {set.note}</Text> : null}
          {link ? (
            // Opens in the YouTube app / browser, not inside GymTrack.
            <Pressable
              onPress={() => openLink(link)}
              accessibilityRole="link"
              style={({ pressed }) => [styles.ytBtn, pressed && { opacity: 0.7 }]}>
              <Text style={styles.ytText}>▶ {t('Watch how on YouTube')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Each part is its own Text so Arabic never jumbles the numbers and units. */}
      {prev ? (
        <View style={styles.lastRow}>
          <Text style={styles.lastTime}>{t('Last time:')}</Text>
          <Text style={styles.lastVal}>
            {toDisplay(prev.weight_kg, unit)} {unit}
          </Text>
          <Text style={styles.lastTime}>×</Text>
          <Text style={styles.lastVal}>
            {prev.reps} {prev.reps === 1 ? t('rep') : t('reps')}
          </Text>
        </View>
      ) : (
        <View style={styles.lastRow}>
          <Text style={styles.lastTime}>{t('First time for this set ✨')}</Text>
        </View>
      )}

      <View style={styles.fields}>
        <View style={{ flex: 1 }}>
          <Field
            label={t('Weight ({unit})', { unit: unit.toUpperCase() })}
            value={weight}
            decimals
            locked={locked}
            onChangeText={(v) => {
              setWeight(v);
              commit(v, reps);
            }}
          />
          <View style={styles.unitSwitch}>
            {(['kg', 'lb'] as const).map((u) => (
              <Pressable
                key={u}
                onPress={() => switchUnit(u)}
                accessibilityRole="button"
                accessibilityState={{ selected: u === unit }}
                style={[styles.unitBtn, u === unit && styles.unitBtnOn]}>
                <Text style={[styles.unitText, u === unit && styles.unitTextOn]}>{u.toUpperCase()}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <Text style={styles.times}>×</Text>
        <View style={{ flex: 1 }}>
          <Field
            label={t('Reps')}
            value={reps}
            decimals={false}
            locked={locked}
            onChangeText={(v) => {
              setReps(v);
              commit(weight, v);
            }}
          />
        </View>
      </View>

      {locked ? (
        // A finished set is read-only until Edit is tapped.
        <View style={styles.doneRow}>
          <Text style={styles.doneText}>✓ {t('Done')}</Text>
          <Button title={t('Edit')} icon="✎" variant="secondary" onPress={() => setEditing(true)} style={{ minWidth: 120 }} />
        </View>
      ) : done ? (
        <View style={styles.doneRow}>
          <Button
            title={t('Undo')}
            variant="secondary"
            onPress={() => {
              setEditing(false);
              onUndo();
            }}
            style={{ flex: 1 }}
          />
          <Button
            title={t('Save')}
            icon="✓"
            onPress={() => {
              Keyboard.dismiss();
              if (valid()) setEditing(false);
            }}
            style={{ flex: 2 }}
          />
        </View>
      ) : (
        <Button
          title={doneLabel}
          icon="✓"
          size="lg"
          onPress={() => {
            if (valid()) onDone();
          }}
          style={{ marginTop: 16 }}
        />
      )}
    </View>
  );
}

/** An outlined number box: its label sits inside while empty and moves above it once filled. */
function Field({
  label,
  value,
  decimals,
  locked,
  onChangeText,
}: {
  label: string;
  value: string;
  decimals: boolean;
  locked: boolean;
  onChangeText: (t: string) => void;
}) {
  return (
    <View>
      <Text style={styles.fieldLabel} numberOfLines={1}>
        {value ? label : ' '}
      </Text>
      {/* The box's style never changes while typing and there's no select-all-on-focus:
          on Android either one re-selects the text after the first digit, so typing "12"
          ended up as "2". The empty-state label is an overlay instead of a placeholder. */}
      <View>
        <TextInput
          style={[styles.bigInput, locked && styles.bigInputLocked]}
          value={value}
          onChangeText={(v) => onChangeText(cleanNumber(v, decimals))}
          keyboardType={decimals ? 'decimal-pad' : 'number-pad'}
          editable={!locked}
          accessibilityLabel={label}
        />
        {!value && (
          <View style={styles.inputHint}>
            <Text style={styles.inputHintText} numberOfLines={1}>
              {label}
            </Text>
          </View>
        )}
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
  lastRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 12,
  },
  lastTime: { color: theme.muted, textAlign: 'center', fontSize: 14 },
  lastVal: { color: theme.text, fontSize: 15, fontWeight: '800' },
  tip: { marginTop: 12, borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, gap: 4 },
  tipText: { fontSize: 13, fontWeight: '700', textAlign: 'center', lineHeight: 19 },
  tipNote: { color: theme.text, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  ytBtn: {
    alignSelf: 'center',
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: alpha(theme.danger, 0.14),
    borderWidth: 1,
    borderColor: alpha(theme.danger, 0.45),
  },
  ytText: { color: theme.danger, fontWeight: '800', fontSize: 14 },
  fields: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 10 },
  fieldLabel: { color: theme.muted, fontSize: 12, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  times: { color: theme.muted, fontSize: 20, fontWeight: '700', marginTop: 36 },
  bigInput: {
    height: 60,
    backgroundColor: theme.input,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: theme.muted,
    color: theme.text,
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  inputHint: {
    pointerEvents: 'none',
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  inputHintText: { color: theme.faint, fontSize: 17, fontWeight: '600' },
  bigInputLocked: { borderColor: theme.border, color: theme.muted },
  unitSwitch: {
    flexDirection: 'row',
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  unitBtn: { flex: 1, height: 38, alignItems: 'center', justifyContent: 'center' },
  unitBtnOn: { backgroundColor: alpha(theme.accent, 0.16) },
  unitText: { color: theme.muted, fontWeight: '800', fontSize: 14 },
  unitTextOn: { color: theme.accent },
  doneRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 16 },
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
  recentVal: { flex: 1, color: theme.text, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  recentUnit: { color: theme.muted, fontSize: 12, fontWeight: '600' },
  navRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  linkRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18, paddingHorizontal: 4 },
  link: { color: theme.accent, fontWeight: '700', fontSize: 14 },
});
