import { Linking, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import type { SetKind } from '@/src/db/queries';
import { t } from '@/src/i18n';
import { alpha, theme } from '@/src/theme';
import { useUnit } from '@/src/UnitContext';
import { reportError } from '@/src/utils/feedback';
import { exerciseTechniques, techniqueName, techniqueNote } from '@/src/utils/techniques';
import { parseYouTube } from '@/src/utils/youtube';

/** Opens a YouTube link outside the app (YouTube app if installed, else the browser). */
export function openYouTube(url: string) {
  if (!parseYouTube(url)) return;
  Linking.openURL(/^https?:\/\//i.test(url) ? url : `https://${url}`).catch(reportError);
}

/**
 * "Note: this exercise includes a drop set" — shown on an exercise wherever it appears (plan,
 * workout list, training), from the techniques ticked on it plus any drop sets in `sets`.
 * `videos` adds a ▶ button per technique that has a YouTube video. Nothing if no techniques.
 */
export function TechniqueNote({
  ids,
  sets,
  videos = false,
  style,
}: {
  ids?: string[];
  sets?: { kind?: SetKind }[];
  videos?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { techniques } = useUnit();
  const list = exerciseTechniques(techniques, ids, sets);
  if (!list.length) return null;
  const withVideo = list.filter((tq) => parseYouTube(tq.link));
  return (
    <View style={[{ gap: 8 }, style]}>
      <Text style={styles.note}>{techniqueNote(list)}</Text>
      {videos && withVideo.length > 0 && (
        <View style={styles.videos}>
          {withVideo.map((tq) => (
            <Pressable
              key={tq.id}
              onPress={() => openYouTube(tq.link)}
              accessibilityRole="link"
              accessibilityLabel={t('Watch {name} on YouTube', { name: techniqueName(tq) })}
              style={({ pressed }) => [styles.video, pressed && { opacity: 0.7 }]}>
              <Text style={styles.videoText}>▶ {techniqueName(tq)}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  note: { color: theme.gold, fontSize: 13, fontWeight: '800', lineHeight: 19 },
  videos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  video: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: alpha(theme.danger, 0.12),
    borderWidth: 1,
    borderColor: alpha(theme.danger, 0.45),
  },
  videoText: { color: theme.danger, fontWeight: '800', fontSize: 13 },
});
