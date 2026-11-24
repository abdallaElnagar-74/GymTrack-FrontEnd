import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { theme } from '../theme';
import { haptic } from '../utils/feedback';

/** `next`: name of the exercise coming up, when the one just finished is complete. */
export type Rest = { endsAt: number; total: number; next?: string };

function fmt(ms: number) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const RING = 260;
const STROKE = 14;
const R = (RING - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

/**
 * Full-screen rest countdown shown after a set is done.
 * Counts down to `endsAt` (so it stays right if the app was in the background), vibrates when
 * the rest is over, then closes itself a few seconds later. Skip, a tap anywhere, or the back
 * button ends it.
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
  const insets = useSafeAreaInsets();
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
    const t = setTimeout(() => closeRef.current(), 3000);
    return () => clearTimeout(t);
  }, [over]);

  const progress = rest.total > 0 ? left / rest.total : 0;

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      {/* Tapping anywhere on the screen ends the rest and goes to the next set. */}
      <Pressable
        onPress={onClose}
        accessible={false}
        style={[styles.screen, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}
        accessibilityViewIsModal>
        <View style={styles.head}>
          <Text style={styles.title}>{over ? 'Rest over' : 'Rest'}</Text>
          <Text style={styles.next} numberOfLines={2}>
            {rest.next ? `Next: ${rest.next}` : 'Next set coming up'}
          </Text>
        </View>

        <View style={styles.ringWrap} accessibilityLiveRegion="polite">
          <Svg width={RING} height={RING}>
            <Circle cx={RING / 2} cy={RING / 2} r={R} stroke={theme.border} strokeWidth={STROKE} fill="none" />
            <Circle
              cx={RING / 2}
              cy={RING / 2}
              r={R}
              stroke={theme.accent}
              strokeWidth={STROKE}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${CIRC} ${CIRC}`}
              strokeDashoffset={CIRC * (1 - progress)}
              transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
            />
          </Svg>
          <View style={styles.ringCenter}>
            <Text
              style={[styles.time, over && { color: theme.accent, fontSize: 44 }]}
              accessibilityLabel={over ? 'Rest over, next set' : `Rest ${fmt(left)} left`}>
              {over ? 'Go! 💪' : fmt(left)}
            </Text>
          </View>
        </View>

        <View style={styles.adjustRow}>
          {!over && (
            <>
              <Small text="−15 s" label="15 seconds less" onPress={() => onAdjust(-15000)} />
              <Small text="+15 s" label="15 seconds more" onPress={() => onAdjust(15000)} />
            </>
          )}
        </View>

        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={over ? 'Start next set' : 'Skip rest'}
          style={({ pressed }) => [styles.skip, pressed && { opacity: 0.8 }]}>
          <Text style={styles.skipText}>{over ? 'Next set ▶' : 'Skip rest ⏭'}</Text>
        </Pressable>
        <Text style={styles.hint}>Tap anywhere to go to the next set</Text>
      </Pressable>
    </Modal>
  );
}

function Small({ text, label, onPress }: { text: string; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.small, pressed && { opacity: 0.7 }]}>
      <Text style={styles.smallText}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.bg,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  head: { alignItems: 'center', gap: 8 },
  title: { color: theme.muted, fontSize: 16, fontWeight: '800', letterSpacing: 3, textTransform: 'uppercase' },
  next: { color: theme.text, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  ringWrap: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  time: { color: theme.text, fontSize: 72, fontWeight: '800', fontVariant: ['tabular-nums'] },
  adjustRow: { flexDirection: 'row', gap: 16, minHeight: 56 },
  small: {
    minWidth: 96,
    height: 56,
    borderRadius: 16,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallText: { color: theme.text, fontWeight: '800', fontSize: 18 },
  skip: {
    alignSelf: 'stretch',
    height: 64,
    borderRadius: 20,
    backgroundColor: theme.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { color: theme.muted, fontSize: 13, marginTop: -12 },
  skipText: { color: theme.onAccent, fontWeight: '900', fontSize: 20 },
});
