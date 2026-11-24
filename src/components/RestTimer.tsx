import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '../theme';
import { haptic } from '../utils/feedback';

/** `next`: name of the exercise coming up, when the one just finished is complete. */
export type Rest = { endsAt: number; total: number; next?: string };

function fmt(ms: number) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Rest countdown shown at the bottom of the workout after a set is ticked.
 * Counts down to `endsAt` (so it stays right if the app was in the background), vibrates when
 * the rest is over, then closes itself a few seconds later.
 */
export function RestTimer({
  rest,
  onAdjust,
  onClose,
}: {
  rest: Rest;
  onAdjust: (deltaMs: number) => void;
  onClose: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const alarmed = useRef(false);
  const left = Math.max(0, rest.endsAt - now);
  const over = left === 0;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  // A new or extended rest can ring again.
  useEffect(() => {
    if (rest.endsAt > Date.now()) alarmed.current = false;
  }, [rest.endsAt]);

  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!over) return;
    if (!alarmed.current) {
      alarmed.current = true;
      haptic.alarm();
    }
    const t = setTimeout(() => closeRef.current(), 5000);
    return () => clearTimeout(t);
  }, [over]);

  const progress = rest.total > 0 ? left / rest.total : 0;

  return (
    <View style={[styles.bar, over && styles.barOver]} accessibilityLiveRegion="polite">
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label} numberOfLines={1}>
            {rest.next ? `${over ? 'Rest over' : 'Rest'} · next: ${rest.next}` : over ? 'Rest over' : 'Rest · next set in'}
          </Text>
          <Text style={[styles.time, over && { color: theme.accent }]} accessibilityLabel={over ? 'Rest over, next set' : `Rest ${fmt(left)} left`}>
            {over ? 'Next set 💪' : fmt(left)}
          </Text>
        </View>
        {!over && (
          <>
            <Chip text="−15" label="15 seconds less" onPress={() => onAdjust(-15000)} />
            <Chip text="+15" label="15 seconds more" onPress={() => onAdjust(15000)} />
          </>
        )}
        <Chip text={over ? 'Close' : 'Skip rest ⏭'} label={over ? 'Close' : 'Skip rest'} onPress={onClose} strong />
      </View>
    </View>
  );
}

function Chip({ text, label, onPress, strong }: { text: string; label: string; onPress: () => void; strong?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.chip, strong && styles.chipStrong, pressed && { opacity: 0.7 }]}>
      <Text style={[styles.chipText, strong && { color: theme.onAccent }]}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: theme.cardAlt,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  barOver: { borderColor: theme.accent },
  track: { height: 3, backgroundColor: theme.border },
  fill: { height: 3, backgroundColor: theme.accent },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  label: { color: theme.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  time: { color: theme.text, fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'] },
  chip: {
    minWidth: 48,
    height: 40,
    borderRadius: 12,
    paddingHorizontal: 10,
    backgroundColor: theme.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipStrong: { backgroundColor: theme.accent, paddingHorizontal: 14 },
  chipText: { color: theme.text, fontWeight: '800', fontSize: 14 },
});
