import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { confirm } from '@/src/utils/confirm';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useApi } from '@/src/api/SessionContext';

import { Arrow, Button, GroupDot, Pill, StatTile, DetailState } from '@/src/components/ui';
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
import { isRTL, locale, t } from '@/src/i18n';

export default function WorkoutDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const { unit } = useUnit();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [missing, setMissing] = useState(false);
  const [groups, setGroups] = useState<WorkoutExercise[]>([]);

  useFocusEffect(
    useCallback(() => {
      const wid = id;
      Promise.all([getWorkout(api, wid), getWorkoutExercises(api, wid)])
        .then(([w, g]) => {
          setWorkout(w);
          setGroups(g);
          setMissing(!w);
        })
        .catch(() => {});
    }, [api, id])
  );

  const onDelete = () =>
    confirm(
      t('Delete workout?'),
      t('This cannot be undone.'),
      t('Delete'),
      async () => {
        await deleteWorkout(api, id);
        router.back();
      },
      { destructive: true }
    );

  if (!workout) return <DetailState missing={missing} what="workout" />;

  const d = new Date(workout.date);
  const sets = groups.reduce((a, g) => a + g.sets.length, 0);
  const volume = groups.reduce((a, g) => a + g.sets.reduce((b, s) => b + setVolume(s), 0), 0);
  const mins = workout.finished_at ? Math.round((workout.finished_at - workout.date) / 60000) : 0;

  return (
    <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: d.toLocaleDateString(locale, { month: 'short', day: 'numeric' }) }} />
      <Text style={styles.kicker}>
        {(workout.title ? `${workout.title} · ` : '') + d.toLocaleDateString(locale, { weekday: 'long' })}
      </Text>
      <Text style={styles.date}>
        {d.toLocaleDateString(locale, { month: 'long', day: 'numeric', year: 'numeric' })}
      </Text>

      <View style={styles.stats}>
        <StatTile value={String(sets)} label={t('Sets')} color={theme.accent} />
        <StatTile value={`${Math.round(toDisplay(volume, unit)).toLocaleString()}`} label={t('Volume ({unit})', { unit })} />
        <StatTile value={mins > 0 && mins < 600 ? t('{n} min', { n: mins }) : '—'} label={t('Duration')} />
      </View>

      {groups.map((g) => {
        const c = groupColor(g.exercise.muscle_group);
        return (
          <View key={g.exercise.id} style={[styles.card, { borderLeftColor: c }]}>
            <Pressable
              style={styles.cardHeader}
              onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: String(g.exercise.id) } })}>
              <GroupDot group={g.exercise.muscle_group} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{g.exercise.name}</Text>
                <Pill text={t(g.exercise.muscle_group)} color={c} />
              </View>
              <Arrow style={styles.chev} />
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
                  <Text style={styles.setStrong}>{s.reps}</Text> {t('reps')}
                </Text>
                {special && <Text style={[styles.kindTag, { color: k.color }]}>{k.label}</Text>}
              </View>
              );
            })}
          </View>
        );
      })}
      <Button title={t('Delete workout')} variant="danger" onPress={onDelete} style={{ marginTop: 16 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  kicker: { color: theme.accent, fontSize: 12, fontWeight: '800', letterSpacing: isRTL ? 0 : 1.5 },
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
