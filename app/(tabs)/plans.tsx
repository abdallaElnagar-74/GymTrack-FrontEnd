import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useApi } from '@/src/api/SessionContext';

import { dropCount } from '@/src/components/DropSetBadge';
import { Arrow, Button, LoadError, Loading, ScreenHeader, SectionTitle } from '@/src/components/ui';
import { useScreenData } from '@/src/hooks/useScreenData';
import {
  createRoutine,
  createRoutineFromTemplate,
  getRoutinesFull,
  plannedSetsOf,
  type RoutineFull,
} from '@/src/db/queries';
import { PLAN_TEMPLATES, type PlanTemplate } from '@/src/db/templates';
import { alpha, theme } from '@/src/theme';
import { notify } from '@/src/utils/confirm';
import { reportError } from '@/src/utils/feedback';
import { formatShortDate } from '@/src/utils/format';
import { kindInfo } from '@/src/utils/setKind';
import { plural, t } from '@/src/i18n';

export default function PlansScreen() {
  const api = useApi();
  const [plans, setPlans] = useState<RoutineFull[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [usingTemplate, setUsingTemplate] = useState<string | null>(null);

  const load = useCallback(() => getRoutinesFull(api).then(setPlans), [api]);
  const { status, error, retry, refreshControl } = useScreenData(load);

  const open = (id: string) => router.push({ pathname: '/routine/[id]', params: { id } });

  const onCreate = async () => {
    if (!name.trim()) return;
    const id = await createRoutine(api, name);
    setName('');
    setCreating(false);
    open(id);
  };

  const existingPlan = (tpl: PlanTemplate) =>
    plans.find((p) => p.name.trim().toLowerCase() === tpl.name.trim().toLowerCase());

  const onTemplate = async (tpl: PlanTemplate) => {
    if (usingTemplate) return;
    setUsingTemplate(tpl.name);
    try {
      // Never adds a second copy: if you already have this plan, it just opens it.
      const { id, existed } = await createRoutineFromTemplate(api, tpl);
      if (existed) notify(t('Already added'), t('You already have "{name}". Opening it.', { name: tpl.name }));
      open(id);
      load().catch(() => {});
    } catch (e) {
      reportError(e);
    } finally {
      setUsingTemplate(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScreenHeader
        subtitle={t('Training plans')}
        title={t('Plans')}
        right={
          <Pressable onPress={() => setCreating((c) => !c)} style={styles.addBtn}>
            <Text style={styles.addBtnText}>{creating ? '✕' : '+'}</Text>
          </Pressable>
        }
      />
      {status === 'loading' ? (
        <Loading />
      ) : status === 'error' ? (
        <LoadError message={error} onRetry={retry} />
      ) : (
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={refreshControl}>
        {creating && (
          <View style={styles.form}>
            <Text style={styles.formTitle}>{t('New plan')}</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={t('e.g. Push Pull Legs')}
              placeholderTextColor={theme.faint}
              autoFocus
              onSubmitEditing={() => onCreate().catch(reportError)}
              returnKeyType="done"
            />
            <Button title={t('Create plan')} onPress={onCreate} disabled={!name.trim()} />
          </View>
        )}

        {plans.length === 0 && !creating && (
          <View style={styles.empty}>
            <Text style={{ fontSize: 44 }}>🗓️</Text>
            <Text style={styles.emptyTitle}>{t('No plans yet')}</Text>
            <Text style={styles.emptySub}>{t('Create your own split, or start from a template below.')}</Text>
          </View>
        )}

        {plans.map((p) => (
          <Pressable
            key={p.id}
            style={({ pressed }) => [styles.plan, pressed && { opacity: 0.85 }]}
            onPress={() => open(p.id)}>
            <View style={styles.planHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.planName}>{p.name}</Text>
                <Text style={styles.planMeta}>
                  {plural(p.days.length, '1 day', '{n} days')}
                  {p.lastDone ? ` · ${t('last trained {date}', { date: formatShortDate(p.lastDone) })}` : ''}
                </Text>
              </View>
              <Arrow style={styles.chev} />
            </View>
            {p.days.map((d, i) => (
              <View key={d.id} style={styles.dayRow}>
                <View style={[styles.dayIdx, d.id === p.nextDayId && styles.dayIdxNext]}>
                  <Text style={[styles.dayIdxText, d.id === p.nextDayId && { color: theme.onAccent }]}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.dayName}>
                    {d.name}
                    {d.id === p.nextDayId ? <Text style={styles.nextTag}>  · {t('NEXT')}</Text> : null}
                  </Text>
                  <Text style={styles.dayEx} numberOfLines={1}>
                    {d.exercises.length
                      ? d.exercises.map((e) => e.name).join(', ')
                      : t('No exercises')}
                  </Text>
                  {/* Which exercises of this day have drop sets, without opening the plan. */}
                  {(() => {
                    const withDrops = d.exercises.filter((e) => dropCount(plannedSetsOf(e)) > 0);
                    return withDrops.length ? (
                      <Text style={styles.dropLine} numberOfLines={2}>
                        ⚠ {t('Drop sets: {names}', { names: withDrops.map((e) => e.name).join(', ') })}
                      </Text>
                    ) : null;
                  })()}
                </View>
              </View>
            ))}
          </Pressable>
        ))}

        <SectionTitle>{t('Templates')}</SectionTitle>
        {PLAN_TEMPLATES.map((tpl) => {
          const have = existingPlan(tpl);
          return (
            <View key={tpl.name} style={[styles.tpl, have && styles.tplAdded]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.tplName}>{tpl.name}</Text>
                <Text style={styles.tplDesc}>{have ? `✓ ${t('Already in your plans')}` : t(tpl.description)}</Text>
              </View>
              <Pressable
                style={[styles.useBtn, have && styles.openBtn]}
                disabled={!!usingTemplate}
                onPress={() => (have ? open(have.id) : onTemplate(tpl))}>
                {usingTemplate === tpl.name ? (
                  <ActivityIndicator color={theme.onAccent} size="small" />
                ) : (
                  <Text style={[styles.useText, have && { color: theme.text }]}>{have ? t('Open') : t('Use')}</Text>
                )}
              </Pressable>
            </View>
          );
        })}
        <Text style={styles.note}>{t('Templates add the days only — you choose the exercises for each day.')}</Text>
      </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: theme.fill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  addBtnText: { color: theme.onAccent, fontSize: 24, fontWeight: '800', marginTop: -2 },
  form: {
    backgroundColor: theme.card,
    borderRadius: theme.radius,
    padding: 14,
    gap: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: theme.border,
  },
  formTitle: { color: theme.text, fontSize: 16, fontWeight: '800' },
  input: {
    backgroundColor: theme.input,
    color: theme.text,
    borderRadius: 12,
    minHeight: 48,
    paddingHorizontal: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  empty: { alignItems: 'center', paddingVertical: 30 },
  emptyTitle: { color: theme.text, fontSize: 18, fontWeight: '800', marginTop: 10 },
  emptySub: { color: theme.muted, marginTop: 4, textAlign: 'center' },
  plan: {
    backgroundColor: theme.card,
    borderRadius: theme.radius,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  planHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  planName: { color: theme.text, fontSize: 20, fontWeight: '800' },
  planMeta: { color: theme.muted, fontSize: 13, marginTop: 2 },
  chev: { color: theme.faint, fontSize: 28 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7 },
  dayIdx: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: theme.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayIdxNext: { backgroundColor: theme.fill },
  dayIdxText: { color: theme.text, fontWeight: '800' },
  dayName: { color: theme.text, fontSize: 15, fontWeight: '700' },
  nextTag: { color: theme.accent, fontSize: 11, fontWeight: '800' },
  dayEx: { color: theme.faint, fontSize: 12, marginTop: 2 },
  dropLine: { color: kindInfo('drop').color, fontSize: 12, fontWeight: '700', marginTop: 3 },
  tpl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.border,
    borderStyle: 'dashed',
  },
  tplName: { color: theme.text, fontSize: 16, fontWeight: '800' },
  tplDesc: { color: theme.muted, fontSize: 12, marginTop: 2 },
  useBtn: {
    backgroundColor: alpha(theme.accent, 0.14),
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  useText: { color: theme.accent, fontWeight: '800' },
  tplAdded: { borderStyle: 'solid', opacity: 0.85 },
  openBtn: { backgroundColor: theme.cardAlt },
  note: { color: theme.faint, fontSize: 12, textAlign: 'center', marginTop: 4 },
});
