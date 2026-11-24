import { useCallback, useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { notify } from '@/src/utils/confirm';
import { router } from 'expo-router';
import { ApiError } from '@/src/api/http';
import { useScreenData } from '@/src/hooks/useScreenData';
import { useApi } from '@/src/api/SessionContext';

import { Arrow, Button, GroupDot, LoadError, Loading, ScreenHeader } from '@/src/components/ui';
import { addExercise, getExercises, type Exercise } from '@/src/db/queries';
import { MUSCLE_GROUPS } from '@/src/db/seed';
import { groupColor, theme } from '@/src/theme';
import { plural, t } from '@/src/i18n';

export default function ExercisesScreen() {
  const api = useApi();
  const [items, setItems] = useState<Exercise[]>([]);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [group, setGroup] = useState<string>('Chest');

  const load = useCallback(() => getExercises(api).then(setItems), [api]);
  const { status, error, retry, refreshControl } = useScreenData(load);

  const sections = useMemo(() => {
    const s = q.trim().toLowerCase();
    const filtered = s ? items.filter((e) => e.name.toLowerCase().includes(s)) : items;
    return MUSCLE_GROUPS.map((g) => ({ title: g as string, data: filtered.filter((e) => e.muscle_group === g) }))
      .concat(
        // any custom groups not in the list
        [{ title: 'Other ', data: filtered.filter((e) => !(MUSCLE_GROUPS as readonly string[]).includes(e.muscle_group)) }]
      )
      .filter((sec) => sec.data.length > 0);
  }, [items, q]);

  const onAdd = async () => {
    if (!name.trim()) return;
    try {
      await addExercise(api, name, group);
      setName('');
      setAdding(false);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) notify(t('Already exists'), t('An exercise with that name already exists.'));
      else throw e; // shown by the button
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScreenHeader
        subtitle={status === 'ready' ? plural(items.length, '1 exercise', '{n} exercises') : ' '}
        title={t('Exercises')}
        right={
          <Pressable onPress={() => setAdding((a) => !a)} style={styles.addBtn}>
            <Text style={styles.addBtnText}>{adding ? '✕' : '+'}</Text>
          </Pressable>
        }
      />
      {status === 'loading' ? (
        <Loading />
      ) : status === 'error' ? (
        <LoadError message={error} onRetry={retry} />
      ) : (
      <SectionList
        refreshControl={refreshControl}
        keyboardDismissMode="on-drag"
        sections={sections}
        keyExtractor={(e) => String(e.id)}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        ListHeaderComponent={
          <View>
            {adding && (
              <View style={styles.form}>
                <Text style={styles.formTitle}>{t('New exercise')}</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder={t('e.g. Cable Crossover')}
                  placeholderTextColor={theme.faint}
                  autoFocus
                  autoCapitalize="words"
                />
                <View style={styles.chips}>
                  {MUSCLE_GROUPS.map((g) => {
                    const active = group === g;
                    const c = groupColor(g);
                    return (
                      <Pressable
                        key={g}
                        onPress={() => setGroup(g)}
                        style={[styles.chip, active && { backgroundColor: c + '26', borderColor: c }]}>
                        <GroupDot group={g} size={8} />
                        <Text style={[styles.chipText, active && { color: c }]}>{t(g)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Button title={t('Save exercise')} onPress={onAdd} disabled={!name.trim()} />
              </View>
            )}
            <View style={styles.searchBox}>
              <Text style={styles.searchIcon}>⌕</Text>
              <TextInput
                style={styles.search}
                value={q}
                onChangeText={setQ}
                placeholder={t('Search exercises')}
                placeholderTextColor={theme.faint}
                returnKeyType="search"
                autoCorrect={false}
              />
              {q ? (
                <Pressable onPress={() => setQ('')} hitSlop={10} accessibilityLabel={t('Clear search')}>
                  <Text style={styles.clear}>✕</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.secHeader}>
            <GroupDot group={section.title.trim()} />
            <Text style={styles.secTitle}>{t(section.title.trim())}</Text>
            <Text style={styles.secCount}>{section.data.length}</Text>
          </View>
        )}
        renderItem={({ item, index, section }) => (
          <Pressable
            style={({ pressed }) => [
              styles.item,
              index === 0 && styles.first,
              index === section.data.length - 1 && styles.last,
              pressed && { backgroundColor: theme.cardAlt },
            ]}
            onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: String(item.id) } })}>
            <Text style={styles.name}>{item.name}</Text>
            <Arrow style={styles.chev} />
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>{q.trim() ? t('No exercises match “{q}”.', { q }) : t('No exercises yet. Tap + to add one.')}</Text>
        }
      />
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: theme.cardAlt,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipText: { color: theme.muted, fontSize: 13, fontWeight: '600' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: theme.border,
  },
  searchIcon: { color: theme.faint, fontSize: 20, marginRight: 8 },
  search: { flex: 1, color: theme.text, minHeight: 48, fontSize: 16 },
  clear: { color: theme.muted, fontSize: 15, fontWeight: '800', paddingHorizontal: 4 },
  secHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22, marginBottom: 8 },
  secTitle: { color: theme.text, fontSize: 15, fontWeight: '800', flex: 1 },
  secCount: { color: theme.faint, fontSize: 13, fontWeight: '700' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: theme.card,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  first: { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  last: { borderBottomLeftRadius: 16, borderBottomRightRadius: 16, borderBottomWidth: 0 },
  name: { color: theme.text, fontSize: 16, fontWeight: '600', flex: 1, paddingVertical: 6 },
  chev: { color: theme.faint, fontSize: 24 },
  empty: { color: theme.muted, textAlign: 'center', marginTop: 30 },
});
