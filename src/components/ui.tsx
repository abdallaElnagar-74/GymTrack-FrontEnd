import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { groupColor, theme } from '../theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';

export function Button({
  title,
  onPress,
  variant = 'primary',
  style,
  icon,
  size = 'md',
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  style?: StyleProp<ViewStyle>;
  icon?: string;
  size?: 'md' | 'lg';
}) {
  const fg = variant === 'primary' ? theme.onAccent : variant === 'ghost' ? theme.accent : theme.text;
  const content = (
    <Text style={[styles.btnText, { color: fg }, size === 'lg' && { fontSize: 18 }]}>
      {icon ? `${icon}  ` : ''}
      {title}
    </Text>
  );
  const h = size === 'lg' ? 58 : 50;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }, style]}>
      {variant === 'primary' ? (
        <LinearGradient
          colors={[theme.accent, theme.accentDark]}
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
            variant === 'secondary' && { backgroundColor: theme.cardAlt },
            variant === 'danger' && { backgroundColor: 'rgba(255,90,95,0.14)', borderWidth: 1, borderColor: 'rgba(255,90,95,0.4)' },
            variant === 'success' && { backgroundColor: theme.success },
            variant === 'ghost' && { borderWidth: 1.5, borderColor: theme.accent, borderStyle: 'dashed' },
          ]}>
          {variant === 'danger' ? (
            <Text style={[styles.btnText, { color: theme.danger }]}>{title}</Text>
          ) : (
            content
          )}
        </View>
      )}
    </Pressable>
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

export function GroupAvatar({ name, group, size = 42 }: { name: string; group: string; size?: number }) {
  const c = groupColor(group);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 3,
        backgroundColor: c + '22',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text style={{ color: c, fontWeight: '800', fontSize: size * 0.4 }}>{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
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
    <View style={styles.pr} accessibilityLabel="New personal record">
      <Text style={styles.prText}>🏆 PR</Text>
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
  btnText: { fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: theme.bg,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  headerSub: { color: theme.muted, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  headerTitle: { color: theme.text, fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
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
  pr: { backgroundColor: 'rgba(255,200,61,0.15)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3 },
  prText: { color: theme.gold, fontWeight: '800', fontSize: 11 },
  section: {
    color: theme.muted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 24,
    marginBottom: 10,
  },
});
