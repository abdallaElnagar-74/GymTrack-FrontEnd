import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useApi } from '@/src/api/SessionContext';
import { ApiError } from '@/src/api/http';

import { ExercisePicker } from '@/src/components/ExercisePicker';
import { TechniqueNote } from '@/src/components/TechniqueNote';
import { PlanSetsEditor } from '@/src/components/PlanSetsEditor';
import { Button, DetailState, GroupDot } from '@/src/components/ui';
import {
  addDay,
  addDayExercise,
  deleteDay,
  deleteRoutine,
  getActiveWorkout,
  getRoutineFull,
  moveDayExercise,
  removeDayExercise,
  renameDay,
  plannedSetsOf,
  renameRoutine,
  saveDayExercisePlan,
  startWorkoutFromDay,
  getWorkoutExercises,
  type DayWithExercises,
  type Exercise,
  type PlannedSet,
  type RoutineFull,
} from '@/src/db/queries';
import { alpha, theme } from '@/src/theme';
import { confirm, notify } from '@/src/utils/confirm';
import { useUnsavedGuard } from '@/src/hooks/useUnsavedGuard';
import { isRTL, plural, t } from '@/src/i18n';

export default function RoutineEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const [plan, setPlan] = useState<RoutineFull | null>(null);
  const [missing, setMissing] = useState(false);
  const [name, setName] = useState('');
  const [pickerDay, setPickerDay] = useState<string | null>(null);
  const [newDay, setNewDay] = useState('');
  // Edits not saved yet (saved together with the Save button, or before Start): day names and
  // planned sets, by id. Adding / removing / moving exercises and days are saved at once.
  const [dayNames, setDayNames] = useState<Record<string, string>>({});
  const [draftSets, setDraftSets] = useState<Record<string, PlannedSet[]>>({});

  const load = useCallback(async () => {
    try {
      const p = await getRoutineFull(api, id);
      setPlan(p);
      setName(p.name);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setPlan(null);
        setMissing(true);
      }
    }
  }, [api, id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const dayIds = new Set(plan?.days.map((d) => d.id));
  const exIds = new Set(plan?.days.flatMap((d) => d.exercises.map((e) => e.id)));
  // Only edits that still differ and whose day / exercise still exists count.
  const nameEdits = Object.entries(dayNames).filter(
    ([dayId, n]) => dayIds.has(dayId) && n.trim() !== plan?.days.find((d) => d.id === dayId)?.name
  );
  const setEdits = Object.entries(draftSets).filter(([deId]) => exIds.has(deId));
  const dirty = !!plan && (name.trim() !== plan.name || nameEdits.length > 0 || setEdits.length > 0);
  useUnsavedGuard(dirty);

  if (!plan) return <DetailState missing={missing} what="plan" />;

  /** Saves every pending edit of this plan in one go. */
  const saveAll = async () => {
    if (!name.trim() || nameEdits.some(([, n]) => !n.trim())) {
      notify(t('Name is required'), t('Give the plan and each day a name.'));
      return false;
    }
    await Promise.all([
      name.trim() !== plan.name ? renameRoutine(api, plan.id, name) : null,
      ...nameEdits.map(([dayId, n]) => renameDay(api, dayId, n)),
      ...setEdits.map(([deId, sets]) => saveDayExercisePlan(api, deId, sets)),
    ]);
    setDayNames({});
    setDraftSets({});
    await load();
    return true;
  };

  const onAddDay = async () => {
    const n = newDay.trim() || t('Day {n}', { n: plan.days.length + 1 });
    await addDay(api, plan.id, n);
    setNewDay('');
    await load();
  };

  const onPick = async (ex: Exercise) => {
    if (pickerDay == null) return;
    const day = plan.days.find((d) => d.id === pickerDay);
    setPickerDay(null);
    if (day?.exercises.some((e) => e.exercise_id === ex.id)) {
      notify(t('Already added'), t('{name} is already in {day}.', { name: ex.name, day: day.name }));
      return;
    }
    await addDayExercise(api, pickerDay, ex.id, 3);
    await load();
  };

  const onStart = async (day: DayWithExercises) => {
    if (day.exercises.length === 0) {
      notify(t('No exercises'), t('Add exercises to this day first.'));
      return;
    }
    // Unsaved changes are saved first, so the workout uses them.
    if (dirty && !(await saveAll())) return;
    const active = await getActiveWorkout(api);
    if (active) {
      notify(t('Workout in progress'), t('Finish or discard your current workout first.'));
      router.navigate('/');
      return;
    }
    const workoutId = await startWorkoutFromDay(api, day.id);
    const first = (await getWorkoutExercises(api, workoutId))[0];
    router.navigate('/');
    // The workout opens straight on its first exercise.
    if (first) router.push({ pathname: '/train/[id]', params: { id: first.exercise.id } });
  };

  const onDeletePlan = () =>
    confirm(
      t('Delete plan?'),
      t('Delete "{name}" and all its days? Your workout history is kept.', { name: plan.name }),
      t('Delete'),
      async () => {
        await deleteRoutine(api, plan.id);
        router.back();
      },
      { destructive: true }
    );

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <Stack.Screen options={{ title: t('Edit plan') }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>{t('PLAN NAME')}</Text>
        <TextInput
          style={styles.planName}
          value={name}
          onChangeText={setName}
          returnKeyType="done"
        />

        {plan.days.map((d, i) => (
          <DayCard
            key={d.id}
            day={d}
            index={i}
            isNext={d.id === plan.nextDayId}
            onRename={(n) => setDayNames((prev) => ({ ...prev, [d.id]: n }))}
            onDelete={() =>
              confirm(t('Delete day?'), t('Delete "{name}" from this plan?', { name: d.name }), t('Delete'), async () => {
                await deleteDay(api, d.id);
                await load();
              }, { destructive: true })
            }
            onAddExercise={() => setPickerDay(d.id)}
            onRemoveExercise={async (deId) => {
              await removeDayExercise(api, deId);
              await load();
            }}
            draftSets={draftSets}
            onChangeSets={(deId, sets) => setDraftSets((prev) => ({ ...prev, [deId]: sets }))}
            onMove={async (idx, dir) => {
              await moveDayExercise(api, d, idx, dir);
              await load();
            }}
            onStart={() => onStart(d)}
          />
        ))}

        <View style={styles.addDay}>
          <TextInput
            style={styles.addDayInput}
            value={newDay}
            onChangeText={setNewDay}
            placeholder={t('Day {n} name (e.g. Push)', { n: plan.days.length + 1 })}
            placeholderTextColor={theme.faint}
            onSubmitEditing={onAddDay}
          />
          <Pressable style={styles.addDayBtn} onPress={onAddDay}>
            <Text style={styles.addDayBtnText}>{t('+ Day')}</Text>
          </Pressable>
        </View>

        <Button title={t('Delete plan')} variant="danger" onPress={onDeletePlan} style={{ marginTop: 30 }} />
      </ScrollView>
      {dirty && (
        // Shown while something typed isn't saved yet.
        <View style={styles.saveBar}>
          <Text style={styles.saveBarText}>{t('Unsaved changes')}</Text>
          <Button title={t('Save')} icon="✓" onPress={saveAll} style={{ flex: 1 }} />
        </View>
      )}
      <ExercisePicker visible={pickerDay != null} onClose={() => setPickerDay(null)} onPick={onPick} />
    </View>
  );
}

function DayCard({
  day,
  index,
  isNext,
  onRename,
  onDelete,
  onAddExercise,
  onRemoveExercise,
  draftSets,
  onChangeSets,
  onMove,
  onStart,
}: {
  day: DayWithExercises;
  index: number;
  isNext: boolean;
  /** The typed name (saved with the screen's Save button). */
  onRename: (name: string) => void;
  onDelete: () => void;
  onAddExercise: () => void;
  onRemoveExercise: (id: string) => void;
  /** Planned sets edited but not saved yet, by day-exercise id. */
  draftSets: Record<string, PlannedSet[]>;
  onChangeSets: (id: string, sets: PlannedSet[]) => void;
  onMove: (index: number, dir: -1 | 1) => void;
  onStart: () => void;
}) {
  const [name, setName] = useState(day.name);
  const setsOf = (e: DayWithExercises['exercises'][number]) => draftSets[e.id] ?? plannedSetsOf(e);
  const totalSets = day.exercises.reduce((a, e) => a + setsOf(e).length, 0);

  return (
    <View style={[styles.day, isNext && { borderColor: alpha(theme.accent, 0.4) }]}>
      <View style={styles.dayHead}>
        <View style={[styles.dayIdx, isNext && { backgroundColor: theme.fill }]}>
          <Text style={[styles.dayIdxText, isNext && { color: theme.onAccent }]}>{index + 1}</Text>
        </View>
        <TextInput
          style={styles.dayName}
          value={name}
          onChangeText={(v) => {
            setName(v);
            onRename(v);
          }}
          returnKeyType="done"
        />
        <Pressable onPress={onDelete} hitSlop={8} style={styles.iconBtn}>
          <Text style={{ color: theme.danger, fontWeight: '800' }}>🗑</Text>
        </Pressable>
      </View>
      <Text style={styles.dayMeta}>
        {plural(day.exercises.length, '1 exercise', '{n} exercises')} · {plural(totalSets, '1 set', '{n} sets')}
        {isNext ? `  ·  ${t('NEXT UP')}` : ''}
      </Text>

      {day.exercises.map((e, i) => (
        <View key={e.id} style={styles.exBlock}>
        <View style={styles.exRow}>
          <View style={styles.order}>
            <Pressable hitSlop={4} onPress={() => onMove(i, -1)} disabled={i === 0}>
              <Text style={[styles.arrow, i === 0 && { opacity: 0.2 }]}>▲</Text>
            </Pressable>
            <Pressable hitSlop={4} onPress={() => onMove(i, 1)} disabled={i === day.exercises.length - 1}>
              <Text style={[styles.arrow, i === day.exercises.length - 1 && { opacity: 0.2 }]}>▼</Text>
            </Pressable>
          </View>
          <Pressable
            style={styles.exLink}
            onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: String(e.exercise_id) } })}>
            <GroupDot group={e.muscle_group} />
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Text style={styles.exName} numberOfLines={1}>
                {e.name}
              </Text>
              {/* Seen without reading the sets: e.g. "Note: this exercise includes a drop set". */}
              <TechniqueNote ids={e.technique_ids} sets={setsOf(e)} />
            </View>
          </Pressable>
          <Text style={styles.setCount}>{plural(setsOf(e).length, '1 set', '{n} sets')}</Text>
          <Pressable
            hitSlop={8}
            onPress={() => onRemoveExercise(e.id)}
            accessibilityRole="button"
            accessibilityLabel={t('Remove {name} from this day', { name: e.name })}
            style={styles.iconBtn}>
            <Text style={{ color: theme.faint, fontWeight: '800' }}>✕</Text>
          </Pressable>
        </View>
        <PlanSetsEditor
          initial={setsOf(e)}
          onChange={(sets) => onChangeSets(e.id, sets)}
        />
        </View>
      ))}
      {day.exercises.length > 0 && <Text style={styles.setsHint}>{t('Weight and reps are entered in each set during the workout.')}</Text>}

      <View style={styles.dayActions}>
        <Button title={t('Add exercise')} icon="+" variant="secondary" onPress={onAddExercise} style={{ flex: 1 }} />
        <Button title={t('Start')} icon="▶" onPress={onStart} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: theme.muted, fontSize: 12, fontWeight: '800', letterSpacing: isRTL ? 0 : 1.2 },
  planName: {
    color: theme.text,
    fontSize: 28,
    fontWeight: '800',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    marginBottom: 18,
  },
  day: {
    backgroundColor: theme.card,
    borderRadius: theme.radius,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: theme.border,
  },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dayIdx: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: theme.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayIdxText: { color: theme.text, fontWeight: '800' },
  dayName: { flex: 1, minWidth: 0, color: theme.text, fontSize: 19, fontWeight: '800', paddingVertical: 4 },
  dayMeta: { color: theme.muted, fontSize: 12, marginTop: 4, marginBottom: 10, marginLeft: 42 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: theme.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exBlock: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.border },
  exRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  setCount: { color: theme.muted, fontSize: 12, fontWeight: '700' },
  order: { width: 18, alignItems: 'center' },
  arrow: { color: theme.muted, fontSize: 10, lineHeight: 14 },
  exName: { flex: 1, minWidth: 0, color: theme.text, fontSize: 15, fontWeight: '600' },
  exLink: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  setsHint: { color: theme.faint, fontSize: 11, textAlign: 'center', marginTop: 4 },
  dayActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  saveBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 18,
    backgroundColor: theme.card,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  saveBarText: { color: theme.gold, fontWeight: '800', fontSize: 13 },
  addDay: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  addDayInput: {
    flex: 1,
    minWidth: 0,
    backgroundColor: theme.card,
    color: theme.text,
    borderRadius: 14,
    minHeight: 50,
    paddingHorizontal: 14,
    fontSize: 15,
    borderWidth: 1,
    borderColor: theme.border,
    borderStyle: 'dashed',
  },
  addDayBtn: {
    height: 50,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: alpha(theme.accent, 0.14),
    alignItems: 'center',
    justifyContent: 'center',
  },
  addDayBtnText: { color: theme.accent, fontWeight: '800', fontSize: 15 },
});
