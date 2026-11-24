import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useApi } from '@/src/api/SessionContext';
import { ApiError } from '@/src/api/http';

import { ExercisePicker } from '@/src/components/ExercisePicker';
import { Button, GroupAvatar, DetailState } from '@/src/components/ui';
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
  renameRoutine,
  setDayExerciseSets,
  startWorkoutFromDay,
  type DayWithExercises,
  type Exercise,
  type RoutineFull,
} from '@/src/db/queries';
import { theme } from '@/src/theme';
import { confirm, notify } from '@/src/utils/confirm';

export default function RoutineEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const [plan, setPlan] = useState<RoutineFull | null>(null);
  const [missing, setMissing] = useState(false);
  const [name, setName] = useState('');
  const [pickerDay, setPickerDay] = useState<string | null>(null);
  const [newDay, setNewDay] = useState('');

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
    const active = await getActiveWorkout(api);
    if (active) {
      notify('Workout in progress', 'Finish or discard your current workout first.');
      router.navigate('/');
      return;
    }
    await startWorkoutFromDay(api, day.id);
    router.navigate('/');
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
            onSets={async (deId, sets) => {
              await setDayExerciseSets(api, deId, sets);
              await load();
            }}
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
  onSets,
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
  onSets: (id: string, sets: number) => void;
  onMove: (index: number, dir: -1 | 1) => void;
  onStart: () => void;
}) {
  const [name, setName] = useState(day.name);
  const save = () => {
    if (name.trim() && name.trim() !== day.name) onRename(name);
  };
  const totalSets = day.exercises.reduce((a, e) => a + e.target_sets, 0);

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
        <View key={e.id} style={styles.exRow}>
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
            <GroupAvatar name={e.name} group={e.muscle_group} size={32} />
            <Text style={styles.exName} numberOfLines={1}>
              {e.name}
            </Text>
          </Pressable>
          <View style={styles.stepper}>
            <Pressable hitSlop={6} onPress={() => onSets(e.id, e.target_sets - 1)} style={styles.stepBtn}>
              <Text style={styles.stepText}>−</Text>
            </Pressable>
            <Text style={styles.stepVal}>{e.target_sets}</Text>
            <Pressable hitSlop={6} onPress={() => onSets(e.id, e.target_sets + 1)} style={styles.stepBtn}>
              <Text style={styles.stepText}>+</Text>
            </Pressable>
          </View>
          <Pressable hitSlop={8} onPress={() => onRemoveExercise(e.id)} style={styles.iconBtn}>
            <Text style={{ color: theme.faint, fontWeight: '800' }}>✕</Text>
          </Pressable>
        </View>
      ))}
      {day.exercises.length > 0 && <Text style={styles.setsHint}>number = sets</Text>}

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
  exRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  order: { width: 18, alignItems: 'center' },
  arrow: { color: theme.muted, fontSize: 10, lineHeight: 14 },
  exName: { flex: 1, minWidth: 0, color: theme.text, fontSize: 15, fontWeight: '600' },
  exLink: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.input,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
  },
  stepBtn: { width: 28, height: 32, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: theme.accent, fontSize: 18, fontWeight: '800' },
  stepVal: { color: theme.text, fontWeight: '800', minWidth: 16, textAlign: 'center' },
  setsHint: { color: theme.faint, fontSize: 11, textAlign: 'right', marginRight: 46, marginTop: 2 },
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
