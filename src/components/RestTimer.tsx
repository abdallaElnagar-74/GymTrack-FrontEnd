import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { isRTL, t } from '../i18n';
import { theme } from '../theme';
import { haptic } from '../utils/feedback';

/** What comes after the rest: another set of the same exercise, the next exercise, or finishing. */
export type UpNext = { kind: 'set' | 'exercise' | 'finish'; title: string; detail?: string };
export type Rest = { endsAt: number; total: number; next?: UpNext };

function fmt(ms: number) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const NEXT_LABEL: Record<UpNext['kind'], string> = {
  set: t('Next set'),
  exercise: t('Next exercise'),
  finish: t('Up next'),
};

/**
 * Full-screen rest countdown shown after a set is done, with what comes next underneath.
 * Counts down to `endsAt` (so it stays right if the app was in the background), vibrates when
 * the rest is over, then closes itself a few seconds later. Skip, a tap anywhere, or the back
 * button ends it. Sizes follow the screen so it fits small phones, big phones and tablets.
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
  const { width, height } = useWindowDimensions();
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

  // Responsive sizes: the ring takes what the screen can spare, within sensible limits.
  const ring = Math.round(Math.max(170, Math.min(width * 0.66, height * 0.34, 320)));
  const stroke = Math.round(ring * 0.055);
  const r = (ring - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const compact = height < 680;
  const progress = rest.total > 0 ? left / rest.total : 0;
  const next = rest.next ?? { kind: 'set' as const, title: t('Next set') };

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      {/* Tapping anywhere on the screen ends the rest. */}
      <Pressable
        onPress={onClose}
        accessible={false}
        style={[styles.screen, { paddingTop: insets.top + (compact ? 16 : 32), paddingBottom: insets.bottom + 20 }]}
        accessibilityViewIsModal>
        <View style={styles.column}>
          <Text style={[styles.title, over && { color: theme.accent }]}>{over ? t('Rest over') : t('Rest')}</Text>

          <View style={[styles.ringWrap, { width: ring, height: ring }]} accessibilityLiveRegion="polite">
            <Svg width={ring} height={ring}>
              <Circle cx={ring / 2} cy={ring / 2} r={r} stroke={theme.border} strokeWidth={stroke} fill="none" />
              <Circle
                cx={ring / 2}
                cy={ring / 2}
                r={r}
                stroke={theme.accent}
                strokeWidth={stroke}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${circ} ${circ}`}
                strokeDashoffset={circ * (1 - progress)}
                transform={`rotate(-90 ${ring / 2} ${ring / 2})`}
              />
            </Svg>
            <View style={styles.ringCenter}>
              <Text
                style={[styles.time, { fontSize: Math.round(ring * (over ? 0.17 : 0.27)) }, over && { color: theme.accent }]}
                accessibilityLabel={over ? t('Rest over') : t('Rest {time} left', { time: fmt(left) })}>
                {over ? t('Go! 💪') : fmt(left)}
              </Text>
            </View>
          </View>

          <View style={styles.adjustRow}>
            {!over && (
              <>
                <Small text={t('−15 s')} label={t('15 seconds less')} onPress={() => onAdjust(-15000)} />
                <Small text={t('+15 s')} label={t('15 seconds more')} onPress={() => onAdjust(15000)} />
              </>
            )}
          </View>

          <View
            style={[styles.nextCard, next.kind !== 'set' && styles.nextCardStrong]}
            accessible
            accessibilityLabel={`${NEXT_LABEL[next.kind]}: ${next.title}${next.detail ? `, ${next.detail}` : ''}`}>
            <Text style={styles.nextLabel}>{NEXT_LABEL[next.kind]}</Text>
            <Text style={[styles.nextTitle, compact && { fontSize: 20 }]} numberOfLines={3}>
              {next.title}
            </Text>
            {next.detail ? <Text style={styles.nextDetail}>{next.detail}</Text> : null}
          </View>
        </View>

        <View style={styles.column}>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={over ? t('Continue') : t('Skip rest')}
            style={({ pressed }) => [styles.skip, pressed && { opacity: 0.8 }]}>
            <Text style={styles.skipText}>{over ? t('Continue ▶') : t('Skip rest ⏭')}</Text>
          </Pressable>
          <Text style={styles.hint}>{t('Tap anywhere to continue')}</Text>
        </View>
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
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // Content keeps a readable width on tablets and the web.
  column: { width: '100%', maxWidth: 460, alignItems: 'center', gap: 18 },
  title: { color: theme.muted, fontSize: 15, fontWeight: '800', letterSpacing: isRTL ? 0 : 3, textTransform: 'uppercase' },
  ringWrap: { alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  time: { color: theme.text, fontWeight: '800', fontVariant: ['tabular-nums'] },
  adjustRow: { flexDirection: 'row', gap: 14, minHeight: 50 },
  small: {
    minWidth: 92,
    height: 50,
    borderRadius: 16,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallText: { color: theme.text, fontWeight: '800', fontSize: 17 },
  nextCard: {
    alignSelf: 'stretch',
    backgroundColor: theme.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: 'center',
    gap: 4,
  },
  nextCardStrong: { borderColor: theme.accent + '66', backgroundColor: theme.fill + '12' },
  nextLabel: { color: theme.accent, fontSize: 12, fontWeight: '800', letterSpacing: isRTL ? 0 : 1.5, textTransform: 'uppercase' },
  nextTitle: { color: theme.text, fontSize: 23, fontWeight: '800', textAlign: 'center' },
  nextDetail: { color: theme.muted, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  skip: {
    alignSelf: 'stretch',
    height: 62,
    borderRadius: 20,
    backgroundColor: theme.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipText: { color: theme.onAccent, fontWeight: '900', fontSize: 19 },
  hint: { color: theme.faint, fontSize: 13, marginTop: -8 },
});
