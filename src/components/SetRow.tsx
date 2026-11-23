import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { SetKind, WorkoutSet } from '../db/queries';
import { theme } from '../theme';
import { formatSet, fromDisplay, toDisplay, type Unit } from '../utils/format';
import { kindInfo, SET_KINDS } from '../utils/setKind';

function numText(n: number) {
  return n > 0 ? String(n) : '';
}

export const SET_COLS = { set: 34, prev: 70, action: 46 };

export function SetRow({
  set,
  label,
  prev,
  unit,
  isPR,
  onChange,
  onChangeKind,
  onToggleDone,
  onDelete,
}: {
  set: WorkoutSet;
  label: string;
  prev?: WorkoutSet;
  unit: Unit;
  isPR: boolean;
  onChange: (reps: number, weightKg: number) => void;
  onChangeKind: (kind: SetKind) => void;
  onToggleDone: () => void;
  onDelete: () => void;
}) {
  const [reps, setReps] = useState(numText(set.reps));
  const [weight, setWeight] = useState(numText(toDisplay(set.weight_kg, unit)));
  const [focus, setFocus] = useState<'w' | 'r' | null>(null);
  const [menu, setMenu] = useState(false);
  const done = set.done === 1;
  const info = kindInfo(set.kind);
  const special = set.kind === 'warmup' || set.kind === 'drop';
  const showTrophy = done && isPR;

  const commit = (r: string, w: string) => {
    const repsN = Math.max(0, parseInt(r, 10) || 0);
    const wN = Math.max(0, parseFloat(w.replace(',', '.')) || 0);
    onChange(repsN, fromDisplay(wN, unit));
  };

  const inputStyle = (f: boolean) => [styles.input, done && styles.inputDone, f && styles.inputFocus];

  return (
    <View style={[styles.row, done && styles.rowDone, done && isPR && styles.rowPR]}>
      <Pressable
        onPress={() => setMenu(true)}
        onLongPress={onDelete}
        delayLongPress={400}
        accessibilityLabel={`${info.label} ${label}. Tap to change set type, long press to delete`}
        style={[
          styles.setNum,
          special && { backgroundColor: info.color + '26', borderColor: info.color + '66', borderWidth: 1 },
          showTrophy && { backgroundColor: 'rgba(255,200,61,0.2)' },
        ]}>
        <Text style={[styles.setNumText, special && { color: info.color }, showTrophy && { color: theme.gold }]}>
          {showTrophy ? '🏆' : label}
        </Text>
      </Pressable>
      <Text style={styles.prev} numberOfLines={1}>
        {prev ? formatSet(prev.reps, prev.weight_kg, unit) : '—'}
      </Text>
      <TextInput
        style={inputStyle(focus === 'w')}
        value={weight}
        onFocus={() => setFocus('w')}
        onBlur={() => setFocus(null)}
        onChangeText={(t) => {
          setWeight(t);
          commit(reps, t);
        }}
        placeholder={prev ? String(toDisplay(prev.weight_kg, unit)) : '0'}
        placeholderTextColor={theme.faint}
        keyboardType="decimal-pad"
        selectTextOnFocus
      />
      <TextInput
        style={inputStyle(focus === 'r')}
        value={reps}
        onFocus={() => setFocus('r')}
        onBlur={() => setFocus(null)}
        onChangeText={(t) => {
          setReps(t);
          commit(t, weight);
        }}
        placeholder={prev ? String(prev.reps) : '0'}
        placeholderTextColor={theme.faint}
        keyboardType="number-pad"
        selectTextOnFocus
      />
      <Pressable
        onPress={onToggleDone}
        hitSlop={6}
        accessibilityLabel={done ? 'Mark set as not done' : 'Mark set as done'}
        style={[styles.check, done && styles.checkDone]}>
        <Text style={[styles.checkText, done && { color: theme.onAccent }]}>✓</Text>
      </Pressable>

      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
        <Pressable style={styles.backdrop} onPress={() => setMenu(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Set type</Text>
            {SET_KINDS.map((k) => {
              const active = set.kind === k.kind;
              return (
                <Pressable
                  key={k.kind}
                  onPress={() => {
                    setMenu(false);
                    if (!active) onChangeKind(k.kind);
                  }}
                  style={({ pressed }) => [styles.option, active && styles.optionActive, pressed && { opacity: 0.8 }]}>
                  <View style={[styles.optBadge, { backgroundColor: k.color + '26' }]}>
                    <Text style={[styles.optBadgeText, { color: k.color }]}>{k.short}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optTitle}>{k.label}</Text>
                    <Text style={styles.optHint}>{k.hint}</Text>
                  </View>
                  {active && <Text style={styles.optCheck}>✓</Text>}
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => {
                setMenu(false);
                onDelete();
              }}
              style={({ pressed }) => [styles.option, pressed && { opacity: 0.8 }]}>
              <View style={[styles.optBadge, { backgroundColor: 'rgba(255,90,95,0.15)' }]}>
                <Text style={[styles.optBadgeText, { color: theme.danger }]}>✕</Text>
              </View>
              <Text style={[styles.optTitle, { color: theme.danger, flex: 1 }]}>Delete set</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderRadius: 12,
  },
  rowDone: { backgroundColor: 'rgba(52,210,123,0.10)' },
  rowPR: { backgroundColor: 'rgba(255,200,61,0.10)' },
  setNum: {
    width: SET_COLS.set,
    height: 34,
    borderRadius: 10,
    backgroundColor: theme.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setNumText: { color: theme.text, fontWeight: '800' },
  prev: { width: SET_COLS.prev, color: theme.muted, fontSize: 13, textAlign: 'center' },
  input: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    width: 0,
    height: 46,
    backgroundColor: theme.input,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: theme.border,
    color: theme.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  inputDone: { backgroundColor: 'transparent', borderColor: 'transparent' },
  inputFocus: { borderColor: theme.accent },
  check: {
    width: SET_COLS.action,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDone: { backgroundColor: theme.success },
  checkText: { color: theme.faint, fontSize: 18, fontWeight: '900' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end', padding: 12 },
  sheet: {
    backgroundColor: theme.card,
    borderRadius: 22,
    padding: 14,
    paddingBottom: 18,
    gap: 6,
    borderWidth: 1,
    borderColor: theme.border,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetTitle: { color: theme.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', margin: 6 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 14 },
  optionActive: { backgroundColor: theme.cardAlt },
  optBadge: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  optBadgeText: { fontWeight: '900', fontSize: 16 },
  optTitle: { color: theme.text, fontSize: 16, fontWeight: '700' },
  optHint: { color: theme.muted, fontSize: 12, marginTop: 1 },
  optCheck: { color: theme.accent, fontSize: 18, fontWeight: '900' },
});
