import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import type { SetKind } from '@/src/db/queries';
import { plural } from '@/src/i18n';
import { alpha } from '@/src/theme';
import { kindInfo } from '@/src/utils/setKind';

/** Number of drop sets in a list of (planned or logged) sets. */
export const dropCount = (sets: { kind?: SetKind }[]) => sets.filter((s) => s.kind === 'drop').length;

/**
 * Warning tag shown on an exercise from the outside (plan, plans list, workout list) when it has drop
 * sets, so you see it before opening its sets: "⚠ Drop set" / "⚠ 2 drop sets". Nothing if none.
 */
export function DropSetBadge({ sets, style }: { sets: { kind?: SetKind }[]; style?: StyleProp<ViewStyle> }) {
  const n = dropCount(sets);
  if (!n) return null;
  const { color } = kindInfo('drop');
  return (
    <View
      style={[styles.badge, { backgroundColor: alpha(color, 0.15), borderColor: alpha(color, 0.55) }, style]}
      accessibilityRole="text">
      <Text style={[styles.text, { color }]}>⚠ {plural(n, 'Drop set', '{n} drop sets')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 7, borderWidth: 1 },
  text: { fontSize: 11, fontWeight: '800' },
});
