import { Pressable, StyleSheet, Text, View } from 'react-native';

import { lang, setLanguage, setMode, t, type Lang } from '../i18n';
import { mode, modeChoice, theme, type ModeChoice } from '../theme';
import { reportError } from '../utils/feedback';

/**
 * Language (English / العربية) and appearance (auto = like the phone / dark / light) switches.
 * Changing one saves it on this phone and restarts the app so every screen (and the text
 * direction) updates.
 */
export function LanguageSegment() {
  return (
    <Segment<Lang>
      value={lang}
      options={[
        { value: 'en', label: 'English' },
        { value: 'ar', label: 'العربية' },
      ]}
      onChange={(v) => setLanguage(v).catch(reportError)}
    />
  );
}

export function ModeSegment() {
  return (
    <Segment<ModeChoice>
      value={modeChoice}
      options={[
        { value: 'system', label: `📱 ${t('Auto')}` },
        { value: 'dark', label: `🌙 ${t('Dark')}` },
        { value: 'light', label: `☀️ ${t('Light')}` },
      ]}
      onChange={(v) => setMode(v).catch(reportError)}
    />
  );
}

/** Compact version for the sign-in screen: both switches on one row. */
export function PrefToggles() {
  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => setLanguage(lang === 'ar' ? 'en' : 'ar').catch(reportError)}
        accessibilityRole="button"
        hitSlop={8}
        style={styles.chip}>
        <Text style={styles.chipText}>{lang === 'ar' ? 'English' : 'العربية'}</Text>
      </Pressable>
      <Pressable
        onPress={() => setMode(mode === 'light' ? 'dark' : 'light').catch(reportError)}
        accessibilityRole="button"
        accessibilityLabel={mode === 'light' ? t('Dark') : t('Light')}
        hitSlop={8}
        style={styles.chip}>
        <Text style={styles.chipText}>{mode === 'light' ? '🌙' : '☀️'}</Text>
      </Pressable>
    </View>
  );
}

function Segment<V extends string>({
  value,
  options,
  onChange,
}: {
  value: V;
  options: { value: V; label: string }[];
  onChange: (v: V) => void;
}) {
  return (
    <View style={styles.segment}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => !active && onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.segItem, active && styles.segActive]}>
            <Text style={[styles.segText, active && { color: theme.onAccent }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  chip: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { color: theme.text, fontWeight: '700', fontSize: 14 },
  segment: {
    flexDirection: 'row',
    backgroundColor: theme.card,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: theme.border,
  },
  segItem: { flex: 1, height: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segActive: { backgroundColor: theme.fill },
  segText: { color: theme.muted, fontWeight: '700', fontSize: 15 },
});
