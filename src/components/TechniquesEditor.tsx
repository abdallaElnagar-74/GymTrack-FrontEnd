import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { Technique } from '@/src/db/queries';
import { isRTL, t } from '@/src/i18n';
import { alpha, theme } from '@/src/theme';
import { useUnit } from '@/src/UnitContext';
import { reportError } from '@/src/utils/feedback';
import { isBuiltin, newTechniqueId, techniqueName } from '@/src/utils/techniques';
import { parseYouTube } from '@/src/utils/youtube';

const MAX = 30;
const badLink = (s: string) => s.trim() !== '' && !parseYouTube(s);

/**
 * The account's techniques (Exercises tab): Warm-up and Drop set always, plus your own
 * (rest-pause, superset…), each with an optional YouTube video. Saved when a field is left;
 * a new technique is saved once it has a name. Each exercise ticks which ones it uses.
 */
export function TechniquesEditor() {
  const { techniques, setTechniques } = useUnit();
  const [rows, setRows] = useState<Technique[]>(techniques);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  // The list may arrive after this opens (settings still loading).
  const [seen, setSeen] = useState(techniques);
  if (techniques !== seen) {
    setSeen(techniques);
    setRows(techniques);
  }

  /** Only complete rows are sent: custom ones need a name, links must be YouTube. */
  const toSave = (list: Technique[]) =>
    list
      .filter((r) => isBuiltin(r.id) || r.name.trim())
      .map((r) => ({ ...r, name: r.name.trim(), link: badLink(r.link) ? '' : r.link.trim() }));

  const save = async (list: Technique[]) => {
    const next = toSave(list);
    if (JSON.stringify(next) === JSON.stringify(toSave(techniques))) return;
    setBusy(true);
    setSaved(false);
    try {
      await setTechniques(next);
      setSaved(true);
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  };

  const change = (i: number, patch: Partial<Technique>) => {
    setSaved(false);
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };

  const remove = (i: number) => {
    const next = rows.filter((_, j) => j !== i);
    setRows(next);
    save(next);
  };

  const add = () => setRows((prev) => [...prev, { id: newTechniqueId(), name: '', link: '' }]);

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
                  onBlur={() => save(rows)}
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
              onBlur={() => save(rows)}
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
        {busy ? (
          <ActivityIndicator size="small" color={theme.accent} />
        ) : saved ? (
          <Text style={styles.saved}>{t('Saved ✓')}</Text>
        ) : null}
      </View>
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
