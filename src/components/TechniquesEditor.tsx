import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { Technique } from '@/src/db/queries';
import { isRTL, t } from '@/src/i18n';
import { alpha, theme } from '@/src/theme';
import { useUnit } from '@/src/UnitContext';
import { Button } from '@/src/components/ui';
import { notify } from '@/src/utils/confirm';
import { isBuiltin, newTechniqueId, techniqueName } from '@/src/utils/techniques';
import { parseYouTube } from '@/src/utils/youtube';

const MAX = 30;
const badLink = (s: string) => s.trim() !== '' && !parseYouTube(s);

/**
 * The account's techniques (Exercises tab): Warm-up and Drop set always, plus your own
 * (rest-pause, superset…), each with an optional YouTube video. Nothing is saved until Save;
 * every technique needs a name and links must be YouTube. Each exercise ticks which ones it uses.
 */
export function TechniquesEditor() {
  const { techniques, setTechniques } = useUnit();
  const [rows, setRows] = useState<Technique[]>(techniques);
  const [saved, setSaved] = useState(false);
  // The list may arrive after this opens (settings still loading).
  const [seen, setSeen] = useState(techniques);
  if (techniques !== seen) {
    setSeen(techniques);
    setRows(techniques);
  }

  const clean = (list: Technique[]) => list.map((r) => ({ ...r, name: r.name.trim(), link: r.link.trim() }));
  // A new row left completely empty doesn't count as a change.
  const typed = rows.filter((r) => isBuiltin(r.id) || r.name.trim() || r.link.trim());
  const dirty = JSON.stringify(clean(typed)) !== JSON.stringify(clean(techniques));

  /** Save button: checks every row, then replaces the list on the server. */
  const save = async () => {
    if (typed.some((r) => !isBuiltin(r.id) && !r.name.trim())) {
      return notify(t('Name is required'), t('Give each technique a name.'));
    }
    if (typed.some((r) => badLink(r.link))) {
      return notify(t('Not a YouTube link'), t('Paste a link like youtube.com/watch?v=… or youtu.be/…'));
    }
    await setTechniques(clean(typed)); // errors are shown by the button
    setSaved(true);
  };

  const change = (i: number, patch: Partial<Technique>) => {
    setSaved(false);
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };

  const remove = (i: number) => {
    setSaved(false);
    setRows((prev) => prev.filter((_, j) => j !== i));
  };

  const add = () => {
    setSaved(false);
    setRows((prev) => [...prev, { id: newTechniqueId(), name: '', link: '' }]);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.sub}>
        {t('Add your techniques with a YouTube video. Tick them on an exercise to show the note on it.')}
      </Text>
      {rows.map((r, i) => {
        const builtin = isBuiltin(r.id);
        return (
          <View key={r.id} style={styles.item}>
            <View style={styles.row}>
              {builtin ? (
                <View style={styles.fixedName}>
                  <Text style={styles.fixedNameText}>{techniqueName(r)}</Text>
                </View>
              ) : (
                <TextInput
                  style={[styles.input, styles.nameInput]}
                  value={r.name}
                  onChangeText={(v) => change(i, { name: v })}
                  placeholder={t('Technique name (e.g. Rest-pause)')}
                  placeholderTextColor={theme.faint}
                  maxLength={60}
                  accessibilityLabel={t('Technique name')}
                />
              )}
              {!builtin && (
                <Pressable
                  onPress={() => remove(i)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('Delete {name}', { name: r.name || t('technique') })}
                  style={styles.del}>
                  <Text style={styles.delText}>✕</Text>
                </Pressable>
              )}
            </View>
            <TextInput
              style={[styles.input, badLink(r.link) && { borderColor: theme.danger }]}
              value={r.link}
              onChangeText={(v) => change(i, { link: v })}
              placeholder={t('YouTube link (optional)')}
              placeholderTextColor={theme.faint}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              maxLength={300}
              accessibilityLabel={t('YouTube video for {type}', { type: techniqueName(r) || t('technique') })}
            />
            {badLink(r.link) && <Text style={styles.err}>{t('That isn’t a YouTube link.')}</Text>}
          </View>
        );
      })}
      <View style={styles.footer}>
        <Pressable
          onPress={add}
          disabled={rows.length >= MAX}
          accessibilityRole="button"
          style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}>
          <Text style={styles.addText}>{t('+ Add technique')}</Text>
        </Pressable>
        {!dirty && saved ? <Text style={styles.saved}>{t('Saved ✓')}</Text> : null}
      </View>
      {dirty && <Button title={t('Save')} icon="✓" onPress={save} />}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: theme.card, borderRadius: 16, padding: 14, gap: 14, borderWidth: 1, borderColor: theme.border },
  sub: { color: theme.muted, fontSize: 13, lineHeight: 18 },
  item: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fixedName: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: alpha(theme.gold, 0.15),
  },
  fixedNameText: { color: theme.gold, fontWeight: '800', fontSize: 13 },
  input: {
    height: 42,
    backgroundColor: theme.input,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    color: theme.text,
    fontSize: 14,
    paddingHorizontal: 12,
    textAlign: isRTL ? 'right' : 'left',
  },
  nameInput: { flex: 1, minWidth: 0, fontWeight: '700' },
  del: { width: 34, height: 34, borderRadius: 10, backgroundColor: theme.cardAlt, alignItems: 'center', justifyContent: 'center' },
  delText: { color: theme.faint, fontWeight: '800' },
  err: { color: theme.danger, fontSize: 12 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  addBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9, backgroundColor: alpha(theme.accent, 0.12) },
  addText: { color: theme.accent, fontWeight: '800', fontSize: 13 },
  saved: { color: theme.accent, fontWeight: '700', fontSize: 12 },
});
