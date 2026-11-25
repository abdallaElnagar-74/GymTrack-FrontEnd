import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { PlannedSet, SetKind } from '../db/queries';
import { isRTL, t } from '../i18n';
import { alpha, theme } from '../theme';
import { kindInfo, setLabels } from '../utils/setKind';

const MAX_SETS = 20;
const NEXT_KIND: Record<SetKind, SetKind> = { normal: 'warmup', warmup: 'drop', drop: 'normal' };

/**
 * One planned set while editing: its type and an optional note (weight and reps are entered while
 * training). Technique videos (e.g. how to do a drop set) are set in the Exercises tab, not here.
 */
type Row = { kind: SetKind; note: string };

const toRows = (sets: PlannedSet[]): Row[] => sets.map((s) => ({ kind: s.kind ?? 'normal', note: s.note ?? '' }));

const toSets = (rows: Row[]): PlannedSet[] =>
  rows.map((r) => ({ kind: r.kind, reps: 0, weight_kg: 0, ...(r.note.trim() ? { note: r.note.trim() } : {}) }));

/**
 * The planned sets of one exercise in a plan day: how many sets, the type of each (working /
 * warm-up / drop) and an optional note. Weight and reps are entered in the training screen.
 * Nothing is saved here: every change goes to `onChange`, and the screen's Save button saves it.
 */
export function PlanSetsEditor({
  initial,
  onChange,
}: {
  initial: PlannedSet[];
  onChange: (sets: PlannedSet[]) => void;
}) {
  const [rows, setRows] = useState(() => toRows(initial));
  const labels = setLabels(rows);

  const update = (next: Row[]) => {
    setRows(next);
    onChange(toSets(next));
  };

  const change = (i: number, patch: Partial<Row>) => update(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => rows.length > 1 && update(rows.filter((_, j) => j !== i));
  const add = () => {
    if (rows.length >= MAX_SETS) return;
    const last = rows[rows.length - 1];
    // A new set has the same type as the last one (a working set after a warm-up), without its note.
    update([...rows, { kind: last && last.kind !== 'warmup' ? last.kind : 'normal', note: '' }]);
  };

  return (
    <View style={styles.wrap}>
      {rows.map((r, i) => {
        const info = kindInfo(r.kind);
        const special = r.kind !== 'normal';
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
});
