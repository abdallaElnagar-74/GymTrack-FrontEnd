import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import {
  getLastSession,
  getPersonalRecords,
  type LastSession,
  type PersonalRecords,
  type SetKind,
  type WorkoutExercise,
  type WorkoutSet,
} from '../db/queries';
import { groupColor, theme } from '../theme';
import { formatShortDate, toDisplay, type Unit } from '../utils/format';
import { estimate1RM } from '../utils/oneRepMax';
import { SET_COLS, SetRow } from './SetRow';
import { kindOrdinals, setLabels } from '../utils/setKind';
import { Button, GroupAvatar, Pill } from './ui';

export function ExerciseCard({
  workoutId,
  group,
  unit,
  onAddSet,
  onChangeSet,
  onDeleteSet,
  onChangeKind,
  onToggleDone,
  onRemove,
}: {
  workoutId: number;
  group: WorkoutExercise;
  unit: Unit;
  onAddSet: (last: LastSession | null) => void;
  onChangeSet: (set: WorkoutSet, reps: number, weightKg: number) => void;
  onDeleteSet: (set: WorkoutSet) => void;
  onChangeKind: (set: WorkoutSet, kind: SetKind) => void;
  onToggleDone: (set: WorkoutSet) => void;
  onRemove: () => void;
}) {
  const db = useSQLiteContext();
  const { exercise, sets } = group;
  const [last, setLast] = useState<LastSession | null>(null);
  const [records, setRecords] = useState<PersonalRecords | null>(null);

  useEffect(() => {
    getLastSession(db, exercise.id, workoutId).then(setLast);
    getPersonalRecords(db, exercise.id, workoutId).then(setRecords);
  }, [db, exercise.id, workoutId]);

  const isPR = (s: WorkoutSet) =>
    s.kind !== 'warmup' &&
    !!records?.hasHistory &&
    s.reps > 0 &&
    s.weight_kg > 0 &&
    (s.weight_kg > records.maxWeight + 0.001 ||
      estimate1RM(s.weight_kg, s.reps) > records.best1RM + 0.01);

  const labels = setLabels(sets);
  const ords = kindOrdinals(sets);
  const lastOrds = last ? kindOrdinals(last.sets) : [];
  // "Last" shows the matching set of the same type from last session (warm-up 1 vs warm-up 1, set 2 vs set 2, …)
  const prevFor = (s: WorkoutSet, i: number) =>
    last?.sets.find((p, j) => (p.kind ?? 'normal') === (s.kind ?? 'normal') && lastOrds[j] === ords[i]);

  const color = groupColor(exercise.muscle_group);
  const doneCount = sets.filter((s) => s.done === 1).length;
  const allDone = sets.length > 0 && doneCount === sets.length;

  return (
    <View style={[styles.card, { borderLeftColor: color }]}>
      <View style={styles.header}>
        <Pressable
          style={styles.titleWrap}
          onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: String(exercise.id) } })}>
          <GroupAvatar name={exercise.name} group={exercise.muscle_group} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>
              {exercise.name}
            </Text>
            <View style={styles.metaRow}>
              <Pill text={exercise.muscle_group} color={color} />
              {last ? (
                <Text style={styles.lastText}>Last · {formatShortDate(last.date)}</Text>
              ) : (
                <Text style={styles.lastText}>First time ✨</Text>
              )}
              <Text style={[styles.lastText, allDone && { color: theme.success, fontWeight: "800" }]}>
                {allDone ? "✓ Done" : `${doneCount}/${sets.length}`}
              </Text>
            </View>
          </View>
        </Pressable>
        <Pressable onPress={onRemove} hitSlop={10} style={styles.more}>
          <Text style={styles.moreText}>✕</Text>
        </Pressable>
      </View>

      {records?.hasHistory ? (
        <View style={styles.best}>
          <Text style={styles.bestText}>
            Best: <Text style={styles.bestVal}>{toDisplay(records.maxWeight, unit)} {unit}</Text>
            {'   '}Est. 1RM: <Text style={styles.bestVal}>{Math.round(toDisplay(records.best1RM, unit))} {unit}</Text>
          </Text>
        </View>
      ) : null}

      <View style={styles.colHeader}>
        <Text style={[styles.col, { width: SET_COLS.set }]}>SET</Text>
        <Text style={[styles.col, { width: SET_COLS.prev }]}>LAST</Text>
        <Text style={[styles.col, styles.flexCol]}>{unit.toUpperCase()}</Text>
        <Text style={[styles.col, styles.flexCol]}>REPS</Text>
        <Text style={[styles.col, { width: SET_COLS.action }]}>DONE</Text>
      </View>

      {sets.map((s, i) => (
        <SetRow
          key={s.id}
          set={s}
          label={labels[i]}
          prev={prevFor(s, i)}
          unit={unit}
          isPR={isPR(s)}
          onChange={(r, w) => onChangeSet(s, r, w)}
          onToggleDone={() => onToggleDone(s)}
          onChangeKind={(k) => onChangeKind(s, k)}
          onDelete={() => onDeleteSet(s)}
        />
      ))}

      <Button title="Add set" icon="+" variant="secondary" onPress={() => onAddSet(last)} style={{ marginTop: 8 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.card,
    borderRadius: theme.radius,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: theme.border,
    borderLeftWidth: 4,
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  titleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { color: theme.text, fontSize: 18, fontWeight: '800' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  lastText: { color: theme.muted, fontSize: 12 },
  more: { width: 34, height: 34, borderRadius: 10, backgroundColor: theme.cardAlt, alignItems: 'center', justifyContent: 'center' },
  moreText: { color: theme.muted, fontWeight: '700' },
  best: { backgroundColor: theme.input, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, marginBottom: 10 },
  bestText: { color: theme.muted, fontSize: 12 },
  bestVal: { color: theme.gold, fontWeight: '800' },
  colHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, marginBottom: 2 },
  flexCol: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  col: { color: theme.faint, fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textAlign: 'center' },
});
