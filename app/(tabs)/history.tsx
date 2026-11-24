import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useApi } from '@/src/api/SessionContext';

import { Arrow, LoadError, Loading, ScreenHeader } from '@/src/components/ui';
import { useScreenData } from '@/src/hooks/useScreenData';
import { getWorkoutSummaries, type WorkoutSummary } from '@/src/db/queries';
import { alpha, theme } from '@/src/theme';
import { useUnit } from '@/src/UnitContext';
import { toDisplay } from '@/src/utils/format';
import { isRTL, locale, plural, t } from '@/src/i18n';

function duration(w: WorkoutSummary) {
  if (!w.finished_at) return null;
  const min = Math.round((w.finished_at - w.date) / 60000);
  if (min < 1 || min > 600) return null;
  return min >= 60 ? t('{h}h {m}m', { h: Math.floor(min / 60), m: min % 60 }) : t('{n} min', { n: min });
}

export default function HistoryScreen() {
  const api = useApi();
  const { unit } = useUnit();
  const [items, setItems] = useState<WorkoutSummary[]>([]);

  const load = useCallback(() => getWorkoutSummaries(api).then(setItems), [api]);
  const { status, error, retry, refreshControl } = useScreenData(load);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScreenHeader
        subtitle={status === 'ready' ? plural(items.length, '1 workout', '{n} workouts') : ' '}
        title={t('History')}
      />
      {status === 'loading' ? (
        <Loading />
      ) : status === 'error' ? (
        <LoadError message={error} onRetry={retry} />
      ) : (
      <FlatList
        refreshControl={refreshControl}
        contentContainerStyle={{ padding: 16, paddingTop: 4 }}
        data={items}
        keyExtractor={(w) => String(w.id)}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 44 }}>📅</Text>
            <Text style={styles.emptyTitle}>{t('No workouts yet')}</Text>
            <Text style={styles.emptySub}>{t('Finished workouts will show up here.')}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const d = new Date(item.date);
          const dur = duration(item);
          return (
            <Pressable
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]}
              onPress={() => router.push({ pathname: '/workout/[id]', params: { id: String(item.id) } })}>
              <View style={styles.dateBlock}>
                <Text style={styles.day}>{d.getDate()}</Text>
                <Text style={styles.month}>{d.toLocaleDateString(locale, { month: 'short' }).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{item.title || d.toLocaleDateString(locale, { weekday: 'long' })}</Text>
                {item.title ? <Text style={styles.sub}>{d.toLocaleDateString(locale, { weekday: 'long' })}</Text> : null}
                <View style={styles.chips}>
                  <Chip text={plural(item.exercise_count, '1 exercise', '{n} exercises')} />
                  <Chip text={plural(item.set_count, '1 set', '{n} sets')} />
                  {dur ? <Chip text={`⏱ ${dur}`} /> : null}
                </View>
                <Text style={styles.volume}>
                  {t('{n} {unit} total volume', { n: Math.round(toDisplay(item.volume, unit)).toLocaleString(), unit })}
                </Text>
              </View>
              <Arrow style={styles.chev} />
            </Pressable>
          );
        }}
      />
      )}
    </View>
  );
}

function Chip({ text }: { text: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: theme.card,
    borderRadius: theme.radius,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.border,
  },
  dateBlock: {
    width: 56,
    height: 60,
    borderRadius: 14,
    backgroundColor: alpha(theme.accent, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  day: { color: theme.accent, fontSize: 22, fontWeight: '800' },
  month: { color: theme.accent, fontSize: 11, fontWeight: '700', letterSpacing: isRTL ? 0 : 1 },
  title: { color: theme.text, fontSize: 17, fontWeight: '700' },
  sub: { color: theme.faint, fontSize: 12, marginTop: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: { backgroundColor: theme.cardAlt, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  chipText: { color: theme.muted, fontSize: 12, fontWeight: '600' },
  volume: { color: theme.faint, fontSize: 12, marginTop: 6 },
  chev: { color: theme.faint, fontSize: 28 },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { color: theme.text, fontSize: 18, fontWeight: '800', marginTop: 10 },
  emptySub: { color: theme.muted, marginTop: 4 },
});
