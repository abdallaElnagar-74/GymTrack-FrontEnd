import { useEffect, useState, type ReactNode } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ExerciseVideo, VideoSource } from '../db/queries';
import { alpha, theme } from '../theme';
import { isRTL, t } from '../i18n';
import { confirm, notify } from '../utils/confirm';
import { canStoreVideoFiles, saveVideoFile, videoFile } from '../utils/videoFiles';
import { parseYouTube, youTubeThumb, youTubeWatchUrl } from '../utils/youtube';
import { Button } from './ui';
import { YouTubeEmbed } from './YouTubeEmbed';

type Props = {
  videos: ExerciseVideo[];
  onAdd: (source: VideoSource, url: string, title: string) => Promise<void>;
  onDelete: (video: ExerciseVideo) => Promise<void>;
};

/** Videos at the top of the exercise page: swipe between them, tap ▶ to play. */
export function ExerciseVideos({ videos, onAdd, onDelete }: Props) {
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const [adding, setAdding] = useState(false);

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {videos.length === 0 ? (
        <Pressable style={styles.empty} onPress={() => setAdding(true)}>
          <View style={styles.emptyIcon}>
            <Text style={{ fontSize: 26, color: theme.accent }}>▶</Text>
          </View>
          <Text style={styles.emptyTitle}>{t('Add a video for this exercise')}</Text>
          <Text style={styles.emptySub}>{t('Paste a YouTube link or upload a video from your phone')}</Text>
        </Pressable>
      ) : (
        <>
          {width > 0 && (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
              onScroll={(e) => Platform.OS === 'web' && setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
              scrollEventThrottle={64}>
              {videos.map((v, i) => (
                <View key={v.id} style={{ width }}>
                  <VideoCard video={v} active={i === page} onDelete={() => onDelete(v)} />
                </View>
              ))}
            </ScrollView>
          )}
          <View style={styles.footerRow}>
            <View style={styles.dots}>
              {videos.length > 1 &&
                videos.map((v, i) => <View key={v.id} style={[styles.dot, i === page && styles.dotActive]} />)}
            </View>
            <Pressable onPress={() => setAdding(true)} style={styles.addSmall} hitSlop={6}>
              <Text style={styles.addSmallText}>{t('+ Add video')}</Text>
            </Pressable>
          </View>
        </>
      )}
      <AddVideoSheet visible={adding} onClose={() => setAdding(false)} onAdd={onAdd} />
    </View>
  );
}

// ---------- One video ----------

function VideoCard({ video, active, onDelete }: { video: ExerciseVideo; active: boolean; onDelete: () => void }) {
  const yt = video.source === 'youtube' ? parseYouTube(video.url) : null;
  const file = video.source === 'file' ? videoFile(video.url) : null;
  const title = video.title || (video.source === 'youtube' ? t('YouTube video') : t('My video'));

  const askDelete = () =>
    confirm(
      t('Remove video?'),
      video.source === 'file' ? t('The video file is deleted from the app.') : t('The link is removed from this exercise.'),
      t('Remove'),
      onDelete,
      { destructive: true }
    );

  return (
    <View style={styles.card}>
      <View style={styles.frame}>
        {yt ? (
          <YouTubeFrame id={yt.id} start={yt.start} active={active} />
        ) : file ? (
          <FileFrame uri={file.uri} active={active} />
        ) : (
          <View style={styles.missing}>
            <Text style={{ fontSize: 28 }}>📱</Text>
            <Text style={styles.missingText}>
              {video.source === 'file'
                ? t('This video was uploaded on another device, so it can only be played there.')
                : t('This link is not a valid YouTube video.')}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.meta}>
        <View style={[styles.badge, video.source === 'youtube' ? styles.badgeYt : styles.badgeFile]}>
          <Text style={styles.badgeText}>{video.source === 'youtube' ? 'YouTube' : t('Uploaded')}</Text>
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {yt && (
          <Pressable onPress={() => Linking.openURL(youTubeWatchUrl(yt.id, yt.start))} hitSlop={8} style={styles.iconBtn}>
            <Text style={styles.iconText}>↗</Text>
          </Pressable>
        )}
        <Pressable onPress={askDelete} hitSlop={8} style={styles.iconBtn}>
          <Text style={[styles.iconText, { color: theme.danger }]}>🗑</Text>
        </Pressable>
      </View>
    </View>
  );
}

function PlayOverlay({ onPress, children }: { onPress: () => void; children?: ReactNode }) {
  return (
    <Pressable onPress={onPress} style={StyleSheet.absoluteFill} accessibilityLabel={t('Play video')}>
      {children}
      <View style={styles.playWrap}>
        <View style={styles.playBtn}>
          <Text style={styles.playIcon}>▶</Text>
        </View>
      </View>
    </Pressable>
  );
}

/** Shows the thumbnail until you tap ▶, then loads the YouTube player (stops when you swipe away). */
function YouTubeFrame({ id, start, active }: { id: string; start: number; active: boolean }) {
  const [playing, setPlaying] = useState(false);
  if (playing && active) return <YouTubeEmbed id={id} start={start} />;
  return (
    <PlayOverlay onPress={() => setPlaying(true)}>
      <Image source={{ uri: youTubeThumb(id) }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <View style={styles.shade} />
    </PlayOverlay>
  );
}

function FileFrame({ uri, active }: { uri: string; active: boolean }) {
  const [started, setStarted] = useState(false);
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
  });
  // Pause when you swipe to another video.
  useEffect(() => {
    if (!active) player.pause();
  }, [active, player]);
  return (
    <>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        nativeControls={started}
        contentFit="contain"
        fullscreenOptions={{ enable: true }}
        allowsPictureInPicture
      />
      {!started && (
        <PlayOverlay
          onPress={() => {
            setStarted(true);
            player.play();
          }}>
          <View style={styles.shade} />
        </PlayOverlay>
      )}
    </>
  );
}

// ---------- Add video ----------

function AddVideoSheet({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: Props['onAdd'];
}) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'youtube' | 'file'>('youtube');
  const [link, setLink] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const parsed = parseYouTube(link);

  const close = () => {
    setLink('');
    setTitle('');
    setMode('youtube');
    onClose();
  };

  const addYouTube = async () => {
    if (!parsed) return notify(t('Not a YouTube link'), t('Paste a link like youtube.com/watch?v=… or youtu.be/…'));
    setBusy(true);
    try {
      await onAdd('youtube', link.trim(), title);
      close();
    } finally {
      setBusy(false);
    }
  };

  const addFile = async (from: 'gallery' | 'files') => {
    let uri: string | null = null;
    let name: string | null = null;
    if (from === 'gallery') {
      await ImagePicker.requestMediaLibraryPermissionsAsync();
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 1 });
      if (r.canceled || !r.assets?.[0]) return;
      uri = r.assets[0].uri;
      name = r.assets[0].fileName ?? null;
    } else {
      const r = await DocumentPicker.getDocumentAsync({ type: 'video/*', copyToCacheDirectory: true });
      if (r.canceled || !r.assets?.[0]) return;
      uri = r.assets[0].uri;
      name = r.assets[0].name;
    }
    setBusy(true);
    try {
      const stored = await saveVideoFile(uri, name);
      await onAdd('file', stored, title);
      close();
    } catch (e: any) {
      notify(t('Could not save video'), String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable style={[styles.sheet, { paddingBottom: 20 + insets.bottom }]} onPress={() => {}}>
            <View style={styles.grabber} />
            <Text style={styles.sheetTitle}>{t('Add video')}</Text>

            <View style={styles.segment}>
              {(['youtube', 'file'] as const).map((m) => (
                <Pressable key={m} onPress={() => setMode(m)} style={[styles.segItem, mode === m && styles.segActive]}>
                  <Text style={[styles.segText, mode === m && { color: theme.onAccent }]}>
                    {m === 'youtube' ? t('YouTube link') : t('Upload video')}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>{t('Title (optional)')}</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder={t("e.g. Proper form, Arnold's tips…")}
              placeholderTextColor={theme.faint}
            />

            {mode === 'youtube' ? (
              <>
                <Text style={styles.label}>{t('YouTube link')}</Text>
                <TextInput
                  style={[styles.input, link.length > 0 && !parsed && { borderColor: theme.danger }]}
                  value={link}
                  onChangeText={setLink}
                  placeholder="https://youtu.be/…"
                  placeholderTextColor={theme.faint}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  onSubmitEditing={addYouTube}
                />
                {link.length > 0 && !parsed && <Text style={styles.err}>{t('That doesn’t look like a YouTube video link.')}</Text>}
                {parsed && (
                  <View style={styles.preview}>
                    <Image source={{ uri: youTubeThumb(parsed.id) }} style={styles.previewImg} />
                    <Text style={styles.ok}>✓ {t('YouTube video found')}</Text>
                  </View>
                )}
                <Button
                  title={busy ? t('Adding…') : t('Add YouTube video')}
                  onPress={busy ? () => {} : addYouTube}
                  style={{ marginTop: 16 }}
                />
              </>
            ) : canStoreVideoFiles ? (
              <>
                <Text style={styles.hint}>{t('The video is copied into the app, so it still plays if you delete it from your gallery.')}</Text>
                <Button
                  title={busy ? t('Saving video…') : t('Choose from gallery')}
                  icon="🎞"
                  onPress={busy ? () => {} : () => addFile('gallery')}
                  style={{ marginTop: 14 }}
                />
                <Button
                  title={t('Choose from files')}
                  icon="📁"
                  variant="secondary"
                  onPress={busy ? () => {} : () => addFile('files')}
                  style={{ marginTop: 10 }}
                />
              </>
            ) : (
              <Text style={[styles.hint, { marginTop: 14 }]}>
                {t('Uploading videos works in the phone app. In the browser you can add YouTube links.')}
              </Text>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  empty: {
    backgroundColor: theme.card,
    borderRadius: theme.radius,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: theme.border,
    alignItems: 'center',
    paddingVertical: 26,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: alpha(theme.accent, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emptyTitle: { color: theme.text, fontSize: 16, fontWeight: '800' },
  emptySub: { color: theme.muted, fontSize: 13, marginTop: 4, textAlign: 'center' },
  card: {
    backgroundColor: theme.card,
    borderRadius: theme.radius,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.border,
  },
  frame: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
  shade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' },
  playWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  playBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: theme.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: { color: theme.onAccent, fontSize: 26, marginLeft: 4 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 8 },
  missingText: { color: theme.muted, textAlign: 'center', fontSize: 13 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  badge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  badgeYt: { backgroundColor: 'rgba(255,60,60,0.18)' },
  badgeFile: { backgroundColor: alpha(theme.accent, 0.14) },
  badgeText: { color: theme.text, fontSize: 11, fontWeight: '800' },
  title: { flex: 1, color: theme.text, fontWeight: '700', fontSize: 15 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: theme.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { color: theme.text, fontSize: 15, fontWeight: '800' },
  footerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  dots: { flex: 1, flexDirection: 'row', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.border },
  dotActive: { backgroundColor: theme.fill, width: 18 },
  addSmall: { backgroundColor: alpha(theme.accent, 0.12), borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  addSmallText: { color: theme.accent, fontWeight: '800', fontSize: 13 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: theme.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: theme.border,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: theme.border, marginBottom: 12 },
  sheetTitle: { color: theme.text, fontSize: 20, fontWeight: '800', marginBottom: 14 },
  segment: {
    flexDirection: 'row',
    backgroundColor: theme.input,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: theme.border,
  },
  segItem: { flex: 1, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segActive: { backgroundColor: theme.fill },
  segText: { color: theme.muted, fontWeight: '700' },
  label: {
    color: theme.muted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: isRTL ? 0 : 1,
    marginTop: 16,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: theme.input,
    color: theme.text,
    borderRadius: 12,
    minHeight: 48,
    paddingHorizontal: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  err: { color: theme.danger, marginTop: 6, fontSize: 13 },
  ok: { color: theme.success, fontWeight: '700' },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  previewImg: { width: 96, height: 54, borderRadius: 8, backgroundColor: '#000' },
  hint: { color: theme.muted, fontSize: 13, lineHeight: 19, marginTop: 14 },
});
