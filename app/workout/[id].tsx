import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { confirm } from '@/src/utils/confirm';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { Button, GroupAvatar, Pill, StatTile } from '@/src/components/ui';
import {
  deleteWorkout,
  getWorkout,
  getWorkoutExercises,
  type Workout,
  type WorkoutExercise,
} from '@/src/db/queries';
import { groupColor, theme } from '@/src/theme';
import { useUnit } from '@/src/UnitContext';
import { toDisplay } from '@/src/utils/format';
import { kindInfo, setLabels, setVolume } from '@/src/utils/setKind';

export default function WorkoutDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const { unit } = useUnit();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [groups, setGroups] = useState<WorkoutExercise[]>([]);

  useFocusEffect(
    useCallback(() => {
      const wid = Number(id);
      getWorkout(db, wid).then(setWorkout);
      getWorkoutExercises(db, wid).then(setGroups);
    }, [db, id])
  );

  const onDelete = () =>
    confirm(
      'Delete workout?',
      'This cannot be undone.',
      'Delete',
      async () => {
        await deleteWorkout(db, Number(id));
        router.back();
      },
      { destructive: true }
    );

  if (!workout) return <View style={{ flex: 1, backgroundColor: theme.bg }} />;

  const d = new Date(workout.date);
  const sets = groups.reduce((a, g) => a + g.sets.length, 0);
  const volume = groups.reduce((a, g) => a + g.sets.reduce((b, s) => b + setVolume(s), 0), 0);
  const mins = workout.finished_at ? Math.round((workout.finished_at - workout.date) / 60000) : 0;

  return (
    <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }} />
      <Text style={styles.kicker}>
        {(workout.title ? `${workout.title} · ` : '') + d.toLocaleDateString(undefined, { weekday: 'long' })}
      </Text>
      <Text style={styles.date}>
        {d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
      </Text>

      <View style={styles.stats}>
        <StatTile value={String(sets)} label="Sets" color={theme.accent} />
        <StatTile value={`${Math.round(toDisplay(volume, unit)).toLocaleString()}`} label={`Volume (${unit})`} />
        <StatTile value={mins > 0 && mins < 600 ? `${mins}m` : '—'} label="Duration" />
      </View>

      {groups.map((g) => {
        const c = groupColor(g.exercise.muscle_group);
        return (
          <View key={g.exercise.id} style={[styles.card, { borderLeftColor: c }]}>
            <Pressable
              style={styles.cardHeader}
              onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: String(g.exercise.id) } })}>
              <GroupAvatar name={g.exercise.name} group={g.exercise.muscle_group} size={36} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{g.exercise.name}</Text>
                <Pill text={g.exercise.muscle_group} color={c} />
              </View>
              <Text style={styles.chev}>›</Text>
            </Pressable>
            {g.sets.map((s, i, arr) => {
              const k = kindInfo(s.kind);
              const special = s.kind === 'warmup' || s.kind === 'drop';
              return (
              <View key={s.id} style={styles.setRow}>
                <View style={[styles.setNum, special && { backgroundColor: k.color + '26' }]}>
                  <Text style={[styles.setNumText, special && { color: k.color }]}>{setLabels(arr)[i]}</Text>
                </View>
                <Text style={styles.setText}>
                  <Text style={styles.setStrong}>{toDisplay(s.weight_kg, unit)}</Text> {unit}
                  <Text style={styles.times}>  ×  </Text>
                  <Text style={styles.setStrong}>{s.reps}</Text> reps
                </Text>
                {special && <Text style={[styles.kindTag, { color: k.color }]}>{k.label}</Text>}
              </View>
              );
            })}
          </View>
        );
      })}
      <Button title="Delete workout" variant="danger" onPress={onDelete} style={{ marginTop: 16 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  kicker: { color: theme.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  date: { color: theme.text, fontSize: 26, fontWeight: '800', marginTop: 2, marginBottom: 16 },
  stats: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  card: {
    backgroundColor: theme.card,
    borderRadius: theme.radius,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.border,
    borderLeftWidth: 4,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  name: { color: theme.text, fontSize: 17, fontWeight: '800', marginBottom: 4 },
  chev: { color: theme.faint, fontSize: 24 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 5 },
  setNum: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: theme.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setNumText: { color: theme.muted, fontWeight: '800', fontSize: 12 },
  setText: { color: theme.muted, fontSize: 15 },
  setStrong: { color: theme.text, fontWeight: '800', fontSize: 16 },
  kindTag: { marginLeft: 'auto', fontSize: 12, fontWeight: '800' },
  times: { color: theme.faint },
});
