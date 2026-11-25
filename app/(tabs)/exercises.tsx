import { useCallback, useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { notify } from '@/src/utils/confirm';
import { router } from 'expo-router';
import { ApiError } from '@/src/api/http';
import { useScreenData } from '@/src/hooks/useScreenData';
import { useApi } from '@/src/api/SessionContext';

import { Arrow, Button, GroupDot, LoadError, Loading, ScreenHeader } from '@/src/components/ui';
import * as ImagePicker from 'expo-image-picker';
import { addExercise, addExerciseVideo, getExercises, type Exercise } from '@/src/db/queries';
import { canStoreVideoFiles, saveVideoFile } from '@/src/utils/videoFiles';
import { parseYouTube } from '@/src/utils/youtube';
import { MUSCLE_GROUPS } from '@/src/db/seed';
import { TechniquesEditor } from '@/src/components/TechniquesEditor';
import { useUnit } from '@/src/UnitContext';
import { techniqueName } from '@/src/utils/techniques';
import { alpha, groupColor, theme } from '@/src/theme';
import { plural, t } from '@/src/i18n';

/**
 * The account's training techniques (warm-up, drop set and your own), each with a YouTube video.
 * Exercises tick which ones they use (exercise screen). Folded by default.
 */
function TechniquesSection() {
  const { techniques } = useUnit();
  const [open, setOpen] = useState(false);
  const count = techniques.filter((tq) => tq.link).length;
  return (
    <View style={styles.tech}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.techHead, pressed && { opacity: 0.75 }]}>
        <Text style={styles.techIcon}>▶</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.techTitle}>{t('Techniques')}</Text>
          <Text style={styles.techSub} numberOfLines={2}>
            {techniques.map((tq) => `${techniqueName(tq)}${tq.link ? ' ▶' : ''}`).join('  ·  ')}
          </Text>
        </View>
        <Text style={styles.techCount}>{plural(count, '1 video', '{n} videos')}</Text>
        <Text style={styles.techChev}>{open ? '▲' : '▼'}</Text>
      </Pressable>
      {open && <TechniquesEditor />}
    </View>
  );
}

export default function ExercisesScreen() {
  const api = useApi();
  const [items, setItems] = useState<Exercise[]>([]);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [group, setGroup] = useState<string>('Chest');
  // Optional video for the new exercise: a YouTube link and/or a video picked from the phone.
  const [link, setLink] = useState('');
  const [picked, setPicked] = useState<{ uri: string; name: string | null } | null>(null);
  const linkOk = !link.trim() || !!parseYouTube(link);

  const pickVideo = async () => {
    await ImagePicker.requestMediaLibraryPermissionsAsync();
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 1 });
    if (!r.canceled && r.assets?.[0]) setPicked({ uri: r.assets[0].uri, name: r.assets[0].fileName ?? null });
  };

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
    if (!linkOk) return notify(t('Not a YouTube link'), t('Paste a link like youtube.com/watch?v=… or youtu.be/…'));
    try {
      const id = await addExercise(api, name, group);
      try {
        if (link.trim()) await addExerciseVideo(api, id, 'youtube', link.trim());
        if (picked) await addExerciseVideo(api, id, 'file', await saveVideoFile(picked.uri, picked.name));
      } catch (e: any) {
        // The exercise is saved either way; the video can be added again from its screen.
        notify(t('Could not save video'), String(e?.message ?? e));
      }
      setName('');
      setLink('');
      setPicked(null);
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
                <Text style={styles.videoLabel}>{t('Video (optional)')}</Text>
                <TextInput
                  style={[styles.input, !linkOk && { borderColor: theme.danger }]}
                  value={link}
                  onChangeText={setLink}
                  placeholder={t('YouTube link')}
                  placeholderTextColor={theme.faint}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
                {!linkOk && <Text style={styles.videoErr}>{t('That doesn’t look like a YouTube video link.')}</Text>}
                {canStoreVideoFiles &&
                  (picked ? (
                    <View style={styles.pickedRow}>
                      <Text style={styles.pickedText} numberOfLines={1}>
                        🎞 {t('Video selected')}
                      </Text>
                      <Pressable onPress={() => setPicked(null)} hitSlop={10} accessibilityLabel={t('Remove')}>
                        <Text style={styles.clear}>✕</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Button title={t('Upload video')} icon="🎞" variant="secondary" onPress={pickVideo} />
                  ))}
                <Button title={t('Save exercise')} onPress={onAdd} disabled={!name.trim()} />
              </View>
            )}
            <TechniquesSection />
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
  tech: { marginTop: 12, gap: 10 },
  techHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 14,
  },
  techIcon: { color: theme.gold, fontSize: 18, fontWeight: '900' },
  techTitle: { color: theme.text, fontSize: 16, fontWeight: '800' },
  techSub: { color: theme.muted, fontSize: 12, marginTop: 2 },
  techCount: { color: theme.accent, fontWeight: '800', fontSize: 13 },
  techChev: { color: theme.faint, fontSize: 11 },
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
  videoLabel: { color: theme.muted, fontSize: 13, fontWeight: '700' },
  videoErr: { color: theme.danger, fontSize: 12, marginTop: -4 },
  pickedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    height: 46,
    borderRadius: 12,
    backgroundColor: alpha(theme.accent, 0.12),
  },
  pickedText: { flex: 1, color: theme.accent, fontWeight: '700' },
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
