import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { PlannedSet, SetKind } from '../db/queries';
import { isRTL, t } from '../i18n';
import { alpha, theme } from '../theme';
import { kindInfo, setLabels } from '../utils/setKind';
import { parseYouTube } from '../utils/youtube';

const MAX_SETS = 20;
const NEXT_KIND: Record<SetKind, SetKind> = { normal: 'warmup', warmup: 'drop', drop: 'normal' };

/**
 * One planned set while editing: its type, an optional note and, for a drop set, an optional
 * YouTube link showing how it's done (weight and reps are entered while training).
 */
type Row = { kind: SetKind; note: string; link: string };

const toRows = (sets: PlannedSet[]): Row[] =>
  sets.map((s) => ({ kind: s.kind ?? 'normal', note: s.note ?? '', link: s.link ?? '' }));

/** Only a valid YouTube link on a drop set is saved (anything else would be refused by the server). */
const linkToSave = (r: Row) => (r.kind === 'drop' && parseYouTube(r.link) ? r.link.trim() : '');

const toSets = (rows: Row[]): PlannedSet[] =>
  rows.map((r) => {
    const link = linkToSave(r);
    return {
      kind: r.kind,
      reps: 0,
      weight_kg: 0,
      ...(r.note.trim() ? { note: r.note.trim() } : {}),
      ...(link ? { link } : {}),
    };
  });

/** A save waiting for the typing to stop. */
type Pending = { timer: ReturnType<typeof setTimeout> | null; run: (() => Promise<unknown>) | null };

function flush(p: Pending) {
  if (p.timer) clearTimeout(p.timer);
  p.timer = null;
  const run = p.run;
  p.run = null;
  return run ? run() : Promise.resolve();
}

/**
 * The planned sets of one exercise in a plan day: how many sets, the type of each (working /
 * warm-up / drop) and an optional note. Weight and reps are entered in the training screen.
 * Saves on its own shortly after a change; `registerFlush` lets the screen save right away
 * (e.g. before starting the day).
 */
export function PlanSetsEditor({
  initial,
  onSave,
  registerFlush,
}: {
  initial: PlannedSet[];
  onSave: (sets: PlannedSet[]) => Promise<unknown>;
  registerFlush: (flushNow: () => Promise<unknown>) => () => void;
}) {
  const [rows, setRows] = useState(() => toRows(initial));
  const pending = useRef<Pending>({ timer: null, run: null });
  const labels = setLabels(rows);

  // Save anything still waiting when the screen asks, or when this editor goes away.
  useEffect(() => {
    const p = pending.current;
    const unregister = registerFlush(() => flush(p));
    return () => {
      unregister();
      flush(p);
    };
  }, [registerFlush]);

  const update = (next: Row[]) => {
    setRows(next);
    const p = pending.current;
    if (p.timer) clearTimeout(p.timer);
    p.run = () => onSave(toSets(next));
    p.timer = setTimeout(() => flush(p), 700);
  };

  const change = (i: number, patch: Partial<Row>) => update(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => rows.length > 1 && update(rows.filter((_, j) => j !== i));
  const add = () => {
    if (rows.length >= MAX_SETS) return;
    const last = rows[rows.length - 1];
    // A new set has the same type as the last one (a working set after a warm-up), without its note.
    update([...rows, { kind: last && last.kind !== 'warmup' ? last.kind : 'normal', note: '', link: '' }]);
  };

  return (
    <View style={styles.wrap}>
      {rows.map((r, i) => {
        const info = kindInfo(r.kind);
        const special = r.kind !== 'normal';
        const badLink = r.link.trim() !== '' && !parseYouTube(r.link);
        return (
          <View key={i} style={{ gap: 6 }}>
          <View style={styles.row}>
            <Pressable
              onPress={() => change(i, { kind: NEXT_KIND[r.kind] })}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel={`${info.label} ${labels[i]}. ${t('Tap to change set type')}`}
              style={[styles.kind, special && { backgroundColor: alpha(info.color, 0.15), borderColor: alpha(info.color, 0.5) }]}>
              <Text style={[styles.kindNum, special && { color: info.color }]}>{labels[i]}</Text>
              <Text style={[styles.kindLabel, special && { color: info.color }]} numberOfLines={1}>
                {info.label}
              </Text>
            </Pressable>
            <TextInput
              style={styles.note}
              value={r.note}
              onChangeText={(v) => change(i, { note: v })}
              placeholder={special ? t('Note (e.g. drop 20%)') : t('Note (optional)')}
              placeholderTextColor={theme.faint}
              maxLength={120}
              accessibilityLabel={t('Note for set {n}', { n: labels[i] })}
            />
            <Pressable
              onPress={() => remove(i)}
              disabled={rows.length <= 1}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={t('Remove set {n}', { n: labels[i] })}
              style={[styles.del, rows.length <= 1 && { opacity: 0.25 }]}>
              <Text style={styles.delText}>✕</Text>
            </Pressable>
          </View>
          {r.kind === 'drop' && (
            // A drop set can link to a YouTube video showing how it's done (opened in YouTube while training).
            // Same three columns as the set row (type · field · ✕) so it lines up in both directions.
            <View style={styles.row}>
              <View style={styles.linkIcon}>
                <Text style={[styles.linkIconText, { color: info.color }]}>▶ YouTube</Text>
              </View>
              <TextInput
                style={[styles.note, badLink && { borderColor: theme.danger }]}
                value={r.link}
                onChangeText={(v) => change(i, { link: v })}
                placeholder={t('YouTube link (optional)')}
                placeholderTextColor={theme.faint}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                maxLength={300}
                accessibilityLabel={t('YouTube link for set {n}', { n: labels[i] })}
              />
              <View style={styles.del} />
            </View>
          )}
          {r.kind === 'drop' && badLink && <Text style={styles.linkError}>{t('That isn’t a YouTube link.')}</Text>}
          </View>
        );
      })}
      <View style={styles.footer}>
        <Pressable
          onPress={add}
          disabled={rows.length >= MAX_SETS}
          accessibilityRole="button"
          style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}>
          <Text style={styles.addText}>{t('+ Add set')}</Text>
        </Pressable>
        <Text style={styles.hint}>{t('Tap a set to change its type: working → warm-up (W) → drop (D)')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 6, marginLeft: 26, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kind: {
    width: 118,
    height: 38,
    borderRadius: 10,
    backgroundColor: theme.cardAlt,
    borderWidth: 1,
    borderColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  kindNum: { color: theme.text, fontWeight: '900', fontSize: 14, minWidth: 14, textAlign: 'center' },
  kindLabel: { flex: 1, color: theme.muted, fontWeight: '700', fontSize: 12 },
  note: {
    flex: 1,
    minWidth: 0,
    height: 38,
    backgroundColor: theme.input,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    color: theme.text,
    fontSize: 14,
    paddingHorizontal: 10,
    textAlign: isRTL ? 'right' : 'left',
  },
  del: { width: 30, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  delText: { color: theme.faint, fontWeight: '800' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  addBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9, backgroundColor: alpha(theme.accent, 0.12) },
  addText: { color: theme.accent, fontWeight: '800', fontSize: 13 },
  hint: { flex: 1, color: theme.faint, fontSize: 11 },
  linkIcon: { width: 118, height: 38, alignItems: 'center', justifyContent: 'center' },
  linkIconText: { fontSize: 13, fontWeight: '900' },
  linkError: { color: theme.danger, fontSize: 12, textAlign: 'center' },
});
