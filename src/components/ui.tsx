import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { isRTL, t } from '../i18n';
import { alpha, groupColor, theme } from '../theme';
import { reportError } from '../utils/feedback';

type Variant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';

export function Button({
  title,
  onPress,
  variant = 'primary',
  style,
  icon,
  arrow,
  size = 'md',
  disabled = false,
}: {
  title: string;
  /** If it returns a promise, the button shows a spinner and ignores taps until it settles; errors are shown. */
  onPress: () => void | Promise<unknown>;
  variant?: Variant;
  style?: StyleProp<ViewStyle>;
  icon?: string;
  /** Arrow next to the title (points the right way in Arabic too). */
  arrow?: 'forward' | 'back';
  size?: 'md' | 'lg';
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const press = () => {
    if (busy || disabled) return;
    const r = onPress();
    if (r && typeof (r as Promise<unknown>).then === 'function') {
      setBusy(true);
      (r as Promise<unknown>).catch((e) => reportError(e)).finally(() => mounted.current && setBusy(false));
    }
  };

  const fg =
    variant === 'primary' ? theme.onAccent : variant === 'ghost' ? theme.accent : variant === 'danger' ? theme.danger : theme.text;
  const content = busy ? (
    <ActivityIndicator color={fg} />
  ) : (
    <View style={styles.btnRow}>
      {arrow === 'back' ? <Arrow dir="back" style={{ color: fg, fontSize: 22 }} /> : null}
      {icon ? (
        <Text style={[styles.btnText, { color: fg }, size === 'lg' && { fontSize: 18 }]}>{icon}</Text>
      ) : null}
      <Text style={[styles.btnText, { color: fg }, size === 'lg' && { fontSize: 18 }]}>{title}</Text>
      {arrow === 'forward' ? <Arrow style={{ color: fg, fontSize: 22 }} /> : null}
    </View>
  );
  const h = size === 'lg' ? 58 : 50;

  return (
    <Pressable
      onPress={press}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled, busy }}
      style={({ pressed }) => [
        { opacity: disabled ? 0.45 : pressed || busy ? 0.75 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        style,
      ]}>
      {variant === 'primary' ? (
        <LinearGradient
          colors={[theme.fill, theme.fillDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.btn, { minHeight: h }]}>
          {content}
        </LinearGradient>
      ) : (
        <View
          style={[
            styles.btn,
            { minHeight: h },
            variant === 'secondary' && {
              backgroundColor: theme.secondary,
              borderWidth: 1,
              borderColor: theme.secondaryBorder,
            },
            variant === 'danger' && { backgroundColor: alpha(theme.danger, 0.14), borderWidth: 1, borderColor: alpha(theme.danger, 0.4) },
            variant === 'success' && { backgroundColor: theme.success },
            variant === 'ghost' && { borderWidth: 1.5, borderColor: theme.accent, borderStyle: 'dashed' },
          ]}>
          {content}
        </View>
      )}
    </Pressable>
  );
}

/**
 * "Go forward / go back" arrow that points the right way in both languages: › / ‹ in English,
 * flipped in Arabic. Drawn left-to-right so the system never mirrors it a second time.
 */
export function Arrow({ dir = 'forward', style }: { dir?: 'forward' | 'back'; style?: StyleProp<TextStyle> }) {
  // Drawn as a vector (text arrows get mirrored by Android in Arabic). Size and colour come from
  // the text style's fontSize / color, so it can replace a "›" character as-is.
  const s = StyleSheet.flatten(style) ?? {};
  const size = s.fontSize ?? 24;
  const right = (dir === 'forward') !== isRTL;
  const w = Math.round(size * 0.42);
  const h = Math.round(size * 0.72);
  return (
    <View
      style={{
        width: w + 8,
        height: Math.max(h, s.lineHeight ?? 0),
        alignItems: 'center',
        justifyContent: 'center',
        opacity: s.opacity,
        paddingHorizontal: s.paddingHorizontal,
      }}>
      <Svg width={w} height={h} viewBox="0 0 10 18">
        <Path
          d={right ? 'M2 2 L8 9 L2 16' : 'M8 2 L2 9 L8 16'}
          stroke={(s.color as string) ?? theme.faint}
          strokeWidth={size >= 36 ? 1.6 : 2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </View>
  );
}

/** Large title header used at the top of tab screens (handles safe-area). */
export function ScreenHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
      <View style={{ flex: 1 }}>
        {subtitle ? <Text style={styles.headerSub}>{subtitle}</Text> : null}
        <Text style={styles.headerTitle}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function StatTile({ value, label, color = theme.text }: { value: string; label: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function GroupDot({ group, size = 10 }: { group: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: groupColor(group) }} />;
}

export function Pill({ text, color = theme.muted }: { text: string; color?: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: color + '1f' }]}>
      <Text style={[styles.pillText, { color }]}>{text}</Text>
    </View>
  );
}

export function PRBadge() {
  return (
    <View style={styles.pr} accessibilityLabel={t('New personal record')}>
      <Text style={styles.prText}>🏆 PR</Text>
    </View>
  );
}

/** Full-area spinner for the first load of a screen. */
export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={theme.accent} size="large" />
      {label ? <Text style={styles.centerSub}>{label}</Text> : null}
    </View>
  );
}

/** Shown when a screen's data couldn't be loaded. */
export function LoadError({ message, onRetry }: { message: string; onRetry: () => Promise<unknown> | void }) {
  return (
    <View style={styles.center}>
      <Text style={{ fontSize: 40 }}>📡</Text>
      <Text style={styles.centerTitle}>{t('Couldn’t load this')}</Text>
      <Text style={styles.centerSub}>{message}</Text>
      <Button title={t('Try again')} onPress={onRetry} variant="secondary" style={{ marginTop: 18, minWidth: 160 }} />
    </View>
  );
}

/** Placeholder for a detail screen: spinner while loading, a message if the item is gone. */
export function DetailState({
  missing,
  what,
  title,
  sub,
}: {
  missing: boolean;
  what: string;
  /** Replaces "This <what> no longer exists" (already translated). */
  title?: string;
  /** Replaces "It may have been deleted on another device." (already translated). */
  sub?: string;
}) {
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      {missing ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 40 }}>🔍</Text>
          <Text style={styles.centerTitle}>{title ?? t('This {what} no longer exists', { what: t(what) })}</Text>
          <Text style={styles.centerSub}>{sub ?? t('It may have been deleted on another device.')}</Text>
          <Button
            title={t('Go back')}
            variant="secondary"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            style={{ marginTop: 18, minWidth: 160 }}
          />
        </View>
      ) : (
        <Loading />
      )}
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.section}>{children}</Text>;
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { fontSize: 16, fontWeight: '700', letterSpacing: isRTL ? 0 : 0.2 },
  btnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: theme.bg,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  headerSub: { color: theme.muted, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: isRTL ? 0 : 1 },
  headerTitle: { color: theme.text, fontSize: 32, fontWeight: '800', letterSpacing: isRTL ? 0 : -0.5 },
  card: {
    backgroundColor: theme.card,
    borderRadius: theme.radius,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  stat: {
    flex: 1,
    backgroundColor: theme.card,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: theme.border,
  },
  statValue: { fontSize: 24, fontWeight: '800' },
  statLabel: { color: theme.muted, fontSize: 12, marginTop: 2 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' },
  pillText: { fontSize: 12, fontWeight: '700' },
  pr: { backgroundColor: alpha(theme.gold, 0.15), borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3 },
  prText: { color: theme.gold, fontWeight: '800', fontSize: 11 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, minHeight: 260 },
  centerTitle: { color: theme.text, fontSize: 18, fontWeight: '800', marginTop: 10 },
  centerSub: { color: theme.muted, fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20, maxWidth: 340 },
  section: {
    color: theme.muted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: isRTL ? 0 : 1,
    marginTop: 24,
    marginBottom: 10,
  },
});
