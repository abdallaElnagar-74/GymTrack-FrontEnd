import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { confirm, notify } from '@/src/utils/confirm';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useApi } from '@/src/api/SessionContext';
import { LineChart } from 'react-native-gifted-charts';

import { ExerciseVideos } from '@/src/components/ExerciseVideos';
import { Button, GroupAvatar, Pill, SectionTitle, StatTile, DetailState } from '@/src/components/ui';
import {
  addExerciseVideo,
  deleteExercise,
  deleteExerciseVideo,
  getExercise,
  getExerciseVideos,
  getExerciseHistory,
  getPersonalRecords,
  updateExercise,
  type Exercise,
  type ExerciseSession,
  type ExerciseVideo,
  type VideoSource,
  type PersonalRecords,
} from '@/src/db/queries';
import { groupColor, theme } from '@/src/theme';
import { useUnit } from '@/src/UnitContext';
import { formatSet, formatShortDate, toDisplay } from '@/src/utils/format';
import { kindInfo } from '@/src/utils/setKind';
import { deleteVideoFile } from '@/src/utils/videoFiles';

// Heaviest set of a session, ignoring warm-ups (falls back to all sets if only warm-ups were logged).
function topWeight(sets: { kind: string; weight_kg: number }[]) {
  const work = sets.filter((x) => x.kind !== 'warmup');
  return Math.max(...(work.length ? work : sets).map((x) => x.weight_kg));
}

export default function ExerciseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const { unit } = useUnit();
  const { width } = useWindowDimensions();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [missing, setMissing] = useState(false);
  const [name, setName] = useState('');
  const [records, setRecords] = useState<PersonalRecords | null>(null);
  const [history, setHistory] = useState<ExerciseSession[]>([]);
  const [videos, setVideos] = useState<ExerciseVideo[]>([]);

  const load = useCallback(async () => {
    const eid = id;
    const [ex, rec, hist, vids] = await Promise.all([
      getExercise(api, eid),
      getPersonalRecords(api, eid),
      getExerciseHistory(api, eid),
      getExerciseVideos(api, eid),
    ]);
    setExercise(ex);
    setMissing(!ex);
    setName(ex?.name ?? '');
    setRecords(rec);
    setHistory(hist);
    setVideos(vids);
  }, [api, id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onAddVideo = async (source: VideoSource, url: string, title: string) => {
    await addExerciseVideo(api, id, source, url, title);
    setVideos(await getExerciseVideos(api, id));
  };

  const onDeleteVideo = async (v: ExerciseVideo) => {
    await deleteExerciseVideo(api, v.id);
    if (v.source === 'file') deleteVideoFile(v.url);
    setVideos(await getExerciseVideos(api, id));
  };

  const onSaveName = async () => {
    if (!exercise || !name.trim() || name.trim() === exercise.name) return;
    try {
      await updateExercise(api, exercise.id, name, exercise.muscle_group);
      await load();
    } catch {
      notify('Already exists', 'An exercise with that name already exists.');
    }
  };

  const onDelete = () => {
    if (!exercise) return;
    confirm(
      'Delete exercise?',
      'Its logged sets will be deleted from your history too.',
      'Delete',
      async () => {
        for (const v of videos) if (v.source === 'file') deleteVideoFile(v.url);
        await deleteExercise(api, exercise.id);
        router.back();
      },
      { destructive: true }
    );
  };

  if (!exercise) return <DetailState missing={missing} what="exercise" />;

  const color = groupColor(exercise.muscle_group);
  const has = !!records?.hasHistory;
  const chartData = [...history].reverse().map((s) => ({
    value: toDisplay(topWeight(s.sets), unit),
    label: formatShortDate(s.date),
  }));
  const chartWidth = Math.min(width, 600) - 32 - 28 - 40;

  return (
    <ScrollView
      style={{ backgroundColor: theme.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: exercise.name }} />
      <ExerciseVideos videos={videos} onAdd={onAddVideo} onDelete={onDeleteVideo} />

      <View style={styles.top}>
        <GroupAvatar name={exercise.name} group={exercise.muscle_group} size={56} />
        <View style={{ flex: 1 }}>
          <TextInput
            style={styles.nameInput}
            value={name}
            onChangeText={setName}
            onEndEditing={onSaveName}
            onBlur={onSaveName}
            returnKeyType="done"
          />
          <Pill text={exercise.muscle_group} color={color} />
        </View>
      </View>

      <SectionTitle>Personal records 🏆</SectionTitle>
      <View style={styles.recRow}>
        <StatTile value={has ? `${toDisplay(records!.maxWeight, unit)}` : '—'} label={`Max weight (${unit})`} color={theme.gold} />
        <StatTile value={has ? `${Math.round(toDisplay(records!.best1RM, unit))}` : '—'} label={`Est. 1RM (${unit})`} color={theme.gold} />
        <StatTile value={String(history.length)} label="Sessions" />
      </View>

      {chartData.length >= 2 && (
        <>
          <SectionTitle>Top weight progress ({unit})</SectionTitle>
          <View style={styles.chart}>
            <LineChart
              data={chartData}
              width={chartWidth}
              height={170}
              areaChart
              curved
              color={theme.accent}
              startFillColor={theme.accent}
              endFillColor={theme.accent}
              startOpacity={0.35}
              endOpacity={0.02}
              thickness={3}
              dataPointsColor={theme.accent}
              dataPointsRadius={4}
              yAxisTextStyle={{ color: theme.faint, fontSize: 10 }}
              xAxisLabelTextStyle={{ color: theme.faint, fontSize: 9 }}
              xAxisColor={theme.border}
              yAxisColor="transparent"
              rulesColor={theme.border}
              rulesType="dashed"
              spacing={Math.max(48, chartWidth / Math.max(1, chartData.length - 1))}
              initialSpacing={12}
              endSpacing={12}
              noOfSections={4}
            />
          </View>
        </>
      )}

      <SectionTitle>History</SectionTitle>
      {history.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.muted}>No sets logged yet. Add this exercise to a workout to start tracking.</Text>
        </View>
      )}
      {history.map((s) => {
        const top = topWeight(s.sets);
        return (
          <View key={s.workoutId} style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.cardDate}>{formatShortDate(s.date)}</Text>
              <Text style={styles.cardTopW}>
                Top {toDisplay(top, unit)} {unit}
              </Text>
            </View>
            <View style={styles.setChips}>
              {s.sets.map((x) => (
                <View
                  key={x.id}
                  style={[styles.setChip, x.kind !== 'normal' && { borderColor: kindInfo(x.kind).color + '66' }]}>
                  <Text style={styles.setChipText}>
                    {x.kind !== 'normal' && (
                      <Text style={{ color: kindInfo(x.kind).color, fontWeight: '900' }}>{kindInfo(x.kind).short} </Text>
                    )}
                    {formatSet(x.reps, x.weight_kg, unit)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        );
      })}

      <Button title="Delete exercise" variant="danger" onPress={onDelete} style={{ marginTop: 20 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  top: {
    marginTop: 20, flexDirection: 'row', alignItems: 'center', gap: 14 },
  nameInput: { color: theme.text, fontSize: 26, fontWeight: '800', padding: 0, marginBottom: 6 },
  recRow: { flexDirection: 'row', gap: 10 },
  chart: {
    backgroundColor: theme.card,
    borderRadius: theme.radius,
    paddingVertical: 16,
    paddingHorizontal: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.border,
  },
  card: {
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.border,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  cardDate: { color: theme.text, fontWeight: '700' },
  cardTopW: { color: theme.accent, fontWeight: '700', fontSize: 13 },
  setChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  setChip: { backgroundColor: theme.cardAlt, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: 'transparent' },
  setChipText: { color: theme.text, fontSize: 13, fontWeight: '600' },
  empty: { backgroundColor: theme.card, borderRadius: 16, padding: 16 },
  muted: { color: theme.muted, lineHeight: 20 },
});
