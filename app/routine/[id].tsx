import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useApi } from '@/src/api/SessionContext';
import { ApiError } from '@/src/api/http';

import { ExercisePicker } from '@/src/components/ExercisePicker';
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
import { theme } from '@/src/theme';
import { useUnit } from '@/src/UnitContext';
import { confirm, notify } from '@/src/utils/confirm';
import { reportError } from '@/src/utils/feedback';
import type { Unit } from '@/src/utils/format';

export default function RoutineEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const [plan, setPlan] = useState<RoutineFull | null>(null);
  const [missing, setMissing] = useState(false);
  const [name, setName] = useState('');
  const [pickerDay, setPickerDay] = useState<string | null>(null);
  const [newDay, setNewDay] = useState('');
  const { unit } = useUnit();
  // Set editors with changes not saved yet; saved before starting a day.
  const flushers = useRef(new Set<() => Promise<unknown>>());
  const registerFlush = useCallback((f: () => Promise<unknown>) => {
    flushers.current.add(f);
    return () => {
      flushers.current.delete(f);
    };
  }, []);

  /** Save planned sets; the screen's totals update without reloading (which would reset typing). */
  const savePlan = useCallback(
    (dayExerciseId: string, sets: PlannedSet[]) =>
      saveDayExercisePlan(api, dayExerciseId, sets)
        .then(() =>
          setPlan((p) =>
            p && {
              ...p,
              days: p.days.map((d) => ({
                ...d,
                exercises: d.exercises.map((e) => (e.id === dayExerciseId ? { ...e, sets, target_sets: sets.length } : e)),
              })),
            }
          )
        )
        .catch((e) => reportError(e, 'Couldn’t save the sets')),
    [api]
  );

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

  if (!plan) return <DetailState missing={missing} what="plan" />;

  const saveName = async () => {
    if (name.trim() && name.trim() !== plan.name) {
      await renameRoutine(api, plan.id, name);
      await load();
    }
  };

  const onAddDay = async () => {
    const n = newDay.trim() || `Day ${plan.days.length + 1}`;
    await addDay(api, plan.id, n);
    setNewDay('');
    await load();
  };

  const onPick = async (ex: Exercise) => {
    if (pickerDay == null) return;
    const day = plan.days.find((d) => d.id === pickerDay);
    setPickerDay(null);
    if (day?.exercises.some((e) => e.exercise_id === ex.id)) {
      notify('Already added', `${ex.name} is already in ${day.name}.`);
      return;
    }
    await addDayExercise(api, pickerDay, ex.id, 3);
    await load();
  };

  const onStart = async (day: DayWithExercises) => {
    if (day.exercises.length === 0) {
      notify('No exercises', 'Add exercises to this day first.');
      return;
    }
    await Promise.all([...flushers.current].map((f) => f()));
    const active = await getActiveWorkout(api);
    if (active) {
      notify('Workout in progress', 'Finish or discard your current workout first.');
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
      'Delete plan?',
      `Delete "${plan.name}" and all its days? Your workout history is kept.`,
      'Delete',
      async () => {
        await deleteRoutine(api, plan.id);
        router.back();
      },
      { destructive: true }
    );

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <Stack.Screen options={{ title: 'Edit plan' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>PLAN NAME</Text>
        <TextInput
          style={styles.planName}
          value={name}
          onChangeText={setName}
          onBlur={saveName}
          onSubmitEditing={saveName}
          returnKeyType="done"
        />

        {plan.days.map((d, i) => (
          <DayCard
            key={d.id}
            day={d}
            index={i}
            isNext={d.id === plan.nextDayId}
            onRename={async (n) => {
              await renameDay(api, d.id, n);
              await load();
            }}
            onDelete={() =>
              confirm('Delete day?', `Delete "${d.name}" from this plan?`, 'Delete', async () => {
                await deleteDay(api, d.id);
                await load();
              }, { destructive: true })
            }
            onAddExercise={() => setPickerDay(d.id)}
            onRemoveExercise={async (deId) => {
              await removeDayExercise(api, deId);
              await load();
            }}
            unit={unit}
            onSavePlan={savePlan}
            registerFlush={registerFlush}
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
            placeholder={`Day ${plan.days.length + 1} name (e.g. Push)`}
            placeholderTextColor={theme.faint}
            onSubmitEditing={onAddDay}
          />
          <Pressable style={styles.addDayBtn} onPress={onAddDay}>
            <Text style={styles.addDayBtnText}>+ Day</Text>
          </Pressable>
        </View>

        <Button title="Delete plan" variant="danger" onPress={onDeletePlan} style={{ marginTop: 30 }} />
      </ScrollView>
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
  unit,
  onSavePlan,
  registerFlush,
  onMove,
  onStart,
}: {
  day: DayWithExercises;
  index: number;
  isNext: boolean;
  onRename: (name: string) => void;
  onDelete: () => void;
  onAddExercise: () => void;
  onRemoveExercise: (id: string) => void;
  unit: Unit;
  onSavePlan: (id: string, sets: PlannedSet[]) => Promise<unknown>;
  registerFlush: (flushNow: () => Promise<unknown>) => () => void;
  onMove: (index: number, dir: -1 | 1) => void;
  onStart: () => void;
}) {
  const [name, setName] = useState(day.name);
  const save = () => {
    if (name.trim() && name.trim() !== day.name) onRename(name);
  };
  const totalSets = day.exercises.reduce((a, e) => a + plannedSetsOf(e).length, 0);

  return (
    <View style={[styles.day, isNext && { borderColor: 'rgba(198,255,61,0.4)' }]}>
      <View style={styles.dayHead}>
        <View style={[styles.dayIdx, isNext && { backgroundColor: theme.accent }]}>
          <Text style={[styles.dayIdxText, isNext && { color: theme.onAccent }]}>{index + 1}</Text>
        </View>
        <TextInput
          style={styles.dayName}
          value={name}
          onChangeText={setName}
          onBlur={save}
          onSubmitEditing={save}
          returnKeyType="done"
        />
        <Pressable onPress={onDelete} hitSlop={8} style={styles.iconBtn}>
          <Text style={{ color: theme.danger, fontWeight: '800' }}>🗑</Text>
        </Pressable>
      </View>
      <Text style={styles.dayMeta}>
        {day.exercises.length} exercises · {totalSets} sets{isNext ? '  ·  NEXT UP' : ''}
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
            <Text style={styles.exName} numberOfLines={1}>
              {e.name}
            </Text>
          </Pressable>
          <Text style={styles.setCount}>{plannedSetsOf(e).length} sets</Text>
          <Pressable
            hitSlop={8}
            onPress={() => onRemoveExercise(e.id)}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${e.name} from this day`}
            style={styles.iconBtn}>
            <Text style={{ color: theme.faint, fontWeight: '800' }}>✕</Text>
          </Pressable>
        </View>
        <PlanSetsEditor
          initial={plannedSetsOf(e)}
          unit={unit}
          onSave={(sets) => onSavePlan(e.id, sets)}
          registerFlush={registerFlush}
        />
        </View>
      ))}
      {day.exercises.length > 0 && <Text style={styles.setsHint}>Empty boxes use what you did last time.</Text>}

      <View style={styles.dayActions}>
        <Button title="Add exercise" icon="+" variant="secondary" onPress={onAddExercise} style={{ flex: 1 }} />
        <Button title="Start" icon="▶" onPress={onStart} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: theme.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
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
    backgroundColor: 'rgba(198,255,61,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addDayBtnText: { color: theme.accent, fontWeight: '800', fontSize: 15 },
});
