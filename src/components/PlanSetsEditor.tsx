import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { PlannedSet, SetKind } from '../db/queries';
import { isRTL, t } from '../i18n';
import { alpha, theme } from '../theme';
import { fromDisplay, toDisplay, type Unit } from '../utils/format';
import { kindInfo, setLabels } from '../utils/setKind';

const MAX_SETS = 20;
const NEXT_KIND: Record<SetKind, SetKind> = { normal: 'warmup', warmup: 'drop', drop: 'normal' };

/** What's being typed (kept as text so "62." or an empty box stay as typed). */
type Row = { kind: SetKind; weight: string; reps: string };

const toRows = (sets: PlannedSet[], unit: Unit): Row[] =>
  sets.map((s) => ({
    kind: s.kind ?? 'normal',
    weight: s.weight_kg > 0 ? String(toDisplay(s.weight_kg, unit)) : '',
    reps: s.reps > 0 ? String(s.reps) : '',
  }));

const toSets = (rows: Row[], unit: Unit): PlannedSet[] =>
  rows.map((r) => ({
    kind: r.kind,
    reps: Math.max(0, parseInt(r.reps, 10) || 0),
    weight_kg: Math.max(0, fromDisplay(parseFloat(r.weight.replace(',', '.')) || 0, unit)),
  }));

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
 * The planned sets of one exercise in a plan day: type, weight and reps for every set.
 * Saves on its own shortly after a change; `registerFlush` lets the screen save right away
 * (e.g. before starting the day).
 */
export function PlanSetsEditor({
  initial,
  unit,
  onSave,
  registerFlush,
}: {
  initial: PlannedSet[];
  unit: Unit;
  onSave: (sets: PlannedSet[]) => Promise<unknown>;
  registerFlush: (flushNow: () => Promise<unknown>) => () => void;
}) {
  const [rows, setRows] = useState(() => toRows(initial, unit));
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
    p.run = () => onSave(toSets(next, unit));
    p.timer = setTimeout(() => flush(p), 700);
  };

  const change = (i: number, patch: Partial<Row>) => update(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => rows.length > 1 && update(rows.filter((_, j) => j !== i));
  const add = () => {
    if (rows.length >= MAX_SETS) return;
    const last = rows[rows.length - 1];
    // A new set copies the last one (a working set if the last was a warm-up).
    update([...rows, last ? { ...last, kind: last.kind === 'warmup' ? 'normal' : last.kind } : { kind: 'normal', weight: '', reps: '' }]);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={[styles.col, styles.setCol]}>{t('SET')}</Text>
        <Text style={[styles.col, styles.flex]}>{unit.toUpperCase()}</Text>
        <Text style={[styles.col, styles.flex]}>{t('REPS')}</Text>
        <View style={styles.delCol} />
      </View>
      {rows.map((r, i) => {
        const info = kindInfo(r.kind);
        const special = r.kind !== 'normal';
        return (
          <View key={i} style={styles.row}>
            <Pressable
              onPress={() => change(i, { kind: NEXT_KIND[r.kind] })}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel={`${info.label} ${labels[i]}. ${t('Tap to change set type')}`}
              style={[
                styles.badge,
                styles.setCol,
                special && { backgroundColor: info.color + '26', borderColor: info.color + '66', borderWidth: 1 },
              ]}>
              <Text style={[styles.badgeText, special && { color: info.color }]}>{labels[i]}</Text>
            </Pressable>
            <TextInput
              style={[styles.input, styles.flex]}
              value={r.weight}
              onChangeText={(t) => change(i, { weight: t })}
              placeholder={t('last')}
              placeholderTextColor={theme.faint}
              keyboardType="decimal-pad"
              selectTextOnFocus
              accessibilityLabel={t('Set {n} weight in {unit}', { n: labels[i], unit })}
            />
            <TextInput
              style={[styles.input, styles.flex]}
              value={r.reps}
              onChangeText={(t) => change(i, { reps: t })}
              placeholder={t('last')}
              placeholderTextColor={theme.faint}
              keyboardType="number-pad"
              selectTextOnFocus
              accessibilityLabel={t('Set {n} reps', { n: labels[i] })}
            />
            <Pressable
              onPress={() => remove(i)}
              disabled={rows.length <= 1}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={t('Remove set {n}', { n: labels[i] })}
              style={[styles.delCol, styles.del, rows.length <= 1 && { opacity: 0.25 }]}>
              <Text style={styles.delText}>✕</Text>
            </Pressable>
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
        <Text style={styles.hint}>{t('Tap the set number: working → warm-up (W) → drop (D)')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 6, marginLeft: 26, gap: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  col: { color: theme.faint, fontSize: 10, fontWeight: '800', letterSpacing: isRTL ? 0 : 0.8, textAlign: 'center' },
  setCol: { width: 34 },
  flex: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  delCol: { width: 30 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: { height: 34, borderRadius: 9, backgroundColor: theme.cardAlt, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: theme.text, fontWeight: '800' },
  input: {
    height: 38,
    backgroundColor: theme.input,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    color: theme.text,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  del: { height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  delText: { color: theme.faint, fontWeight: '800' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  addBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9, backgroundColor: alpha(theme.accent, 0.12) },
  addText: { color: theme.accent, fontWeight: '800', fontSize: 13 },
  hint: { flex: 1, color: theme.faint, fontSize: 11 },
});
