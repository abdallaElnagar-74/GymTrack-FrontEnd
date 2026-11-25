import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';

import type { SetKind } from '@/src/db/queries';
import { isRTL, t } from '@/src/i18n';
import { alpha, theme } from '@/src/theme';
import { reportError } from '@/src/utils/feedback';
import { SET_KINDS } from '@/src/utils/setKind';
import { parseYouTube } from '@/src/utils/youtube';

/** Set types that are a training technique (everything but a plain working set). */
const TECHNIQUES = SET_KINDS.filter((k) => k.kind !== 'normal');

/**
 * Exercise settings: one YouTube video per technique (warm-up, drop set…). While training, every
 * set of that type, in any plan, shows "Watch how on YouTube" with it, unless the planned set has
 * its own link. Saved when the field loses focus; an empty field removes the video.
 */
export function TechniqueLinks({
  links,
  onSave,
}: {
  links: Partial<Record<SetKind, string>>;
  onSave: (kind: SetKind, link: string) => Promise<void>;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.sub}>{t('Used for these sets in every plan, so you don’t add the link to each set.')}</Text>
      {TECHNIQUES.map((k) => (
        <Row key={k.kind} kind={k.kind} label={k.label} color={k.color} saved={links[k.kind] ?? ''} onSave={onSave} />
      ))}
    </View>
  );
}

function Row({
  kind,
  label,
  color,
  saved,
  onSave,
}: {
  kind: SetKind;
  label: string;
  color: string;
  saved: string;
  onSave: (kind: SetKind, link: string) => Promise<void>;
}) {
  const [text, setText] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const bad = text.trim() !== '' && !parseYouTube(text);

  const save = async () => {
    const v = text.trim();
    if (bad || v === saved.trim() || busy) return;
    setBusy(true);
    setDone(false);
    try {
      await onSave(kind, v);
      setDone(true);
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 4 }}>
      <View style={styles.head}>
        <View style={[styles.badge, { backgroundColor: alpha(color, 0.15), borderColor: alpha(color, 0.5) }]}>
          <Text style={[styles.badgeText, { color }]}>{label}</Text>
        </View>
        {busy ? (
          <ActivityIndicator size="small" color={theme.accent} />
        ) : done ? (
          <Text style={styles.saved}>{t('Saved ✓')}</Text>
        ) : null}
      </View>
      <TextInput
        style={[styles.input, bad && { borderColor: theme.danger }]}
        value={text}
        onChangeText={(v) => {
          setText(v);
          setDone(false);
        }}
        onEndEditing={save}
        onBlur={save}
        placeholder={t('YouTube link (optional)')}
        placeholderTextColor={theme.faint}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="done"
        maxLength={300}
        accessibilityLabel={t('YouTube video for {type}', { type: label })}
      />
      {bad && <Text style={styles.err}>{t('That isn’t a YouTube link.')}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  sub: { color: theme.muted, fontSize: 13, lineHeight: 18 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  badgeText: { fontWeight: '800', fontSize: 13 },
  saved: { color: theme.accent, fontWeight: '700', fontSize: 12 },
  input: {
    height: 42,
    backgroundColor: theme.input,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    color: theme.text,
    fontSize: 14,
    paddingHorizontal: 12,
    textAlign: isRTL ? 'right' : 'left',
  },
  err: { color: theme.danger, fontSize: 12 },
});
