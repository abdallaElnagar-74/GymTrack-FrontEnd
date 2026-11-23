import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { confirm, notify } from '@/src/utils/confirm';
import { useSQLiteContext } from 'expo-sqlite';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

import { ScreenHeader, SectionTitle } from '@/src/components/ui';
import { exportAll, importAll, type BackupFile } from '@/src/db/queries';
import { theme } from '@/src/theme';
import { useUnit } from '@/src/UnitContext';
import type { Unit } from '@/src/utils/format';
import { useSync } from '@/src/sync/SyncContext';
import { router, type Href } from 'expo-router';

function timeAgo(ts: number) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ts).toLocaleDateString();
}

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const { unit, setUnit } = useUnit();
  const sync = useSync();
  const [busy, setBusy] = useState(false);

  const onExport = async () => {
    try {
      setBusy(true);
      const data = await exportAll(db);
      const stamp = new Date().toISOString().slice(0, 10);
      const file = new File(Paths.cache, `gymapp-backup-${stamp}.json`);
      if (file.exists) file.delete();
      file.create();
      file.write(JSON.stringify(data));
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save GymApp backup' });
      } else {
        notify('Sharing unavailable', 'Cannot share files on this device.');
      }
    } catch (e: any) {
      notify('Export failed', String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    try {
      setBusy(true);
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const text = await new File(res.assets[0].uri).text();
      const data = JSON.parse(text) as BackupFile;
      await importAll(db, data);
      sync.sync();
      notify('Backup restored', 'Your workouts were imported.');
    } catch (e: any) {
      notify('Import failed', String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const onImport = () =>
    confirm('Restore backup?', 'This replaces ALL current data with the backup file.', 'Restore', doImport, {
      destructive: true,
    });

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScreenHeader title="Settings" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0 }}>
        <SectionTitle>Cloud sync</SectionTitle>
        <View style={styles.group}>
          {sync.email ? (
            <>
              <View style={styles.row}>
                <View style={styles.rowIcon}>
                  <Text style={{ color: theme.accent, fontSize: 18 }}>☁</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {sync.email}
                  </Text>
                  <Text style={[styles.rowSub, sync.error ? { color: theme.danger } : null]} numberOfLines={2}>
                    {sync.syncing
                      ? 'Syncing…'
                      : sync.error
                        ? sync.error
                        : sync.lastSyncAt
                          ? `Synced ${timeAgo(sync.lastSyncAt)}`
                          : 'Not synced yet'}
                  </Text>
                </View>
              </View>
              <View style={styles.sep} />
              <Row icon="⟳" title="Sync now" sub="Upload & download changes" onPress={() => sync.sync()} />
              <View style={styles.sep} />
              <Row
                icon="⎋"
                title="Sign out"
                sub="Your data stays on this phone"
                onPress={() =>
                  confirm('Sign out?', 'Syncing stops. Your data stays on this phone.', 'Sign out', () => sync.signOut())
                }
              />
            </>
          ) : (
            <Row
              icon="☁"
              title="Sign in to sync"
              sub="Back up to the cloud & use multiple phones"
              onPress={() => router.push('/account' as Href)}
            />
          )}
        </View>

        <SectionTitle>Weight unit</SectionTitle>
        <View style={styles.segment}>
          {(['kg', 'lb'] as Unit[]).map((u) => {
            const active = unit === u;
            return (
              <Pressable key={u} onPress={() => setUnit(u)} style={[styles.segItem, active && styles.segActive]}>
                <Text style={[styles.segText, active && { color: theme.onAccent }]}>
                  {u === 'kg' ? 'Kilograms (kg)' : 'Pounds (lb)'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <SectionTitle>Backup</SectionTitle>
        <View style={styles.group}>
          <Row icon="⬆" title="Export backup" sub={busy ? 'Working…' : 'Save all data to a file'} onPress={onExport} />
          <View style={styles.sep} />
          <Row icon="⬇" title="Import backup" sub="Replace data from a backup file" onPress={onImport} />
        </View>
        <Text style={styles.note}>
          {sync.email
            ? 'Your data is synced to the cloud. A file backup is an extra copy you control.'
            : 'Your data lives only on this phone. Sign in to sync, or export a backup regularly.'}
        </Text>

        <Text style={styles.footer}>Gym Tracker · v1.0</Text>
      </ScrollView>
    </View>
  );
}

function Row({ icon, title, sub, onPress }: { icon: string; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.cardAlt }]}>
      <View style={styles.rowIcon}>
        <Text style={{ color: theme.accent, fontSize: 18, fontWeight: '800' }}>{icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub}>{sub}</Text>
      </View>
      <Text style={styles.chev}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  segment: {
    flexDirection: 'row',
    backgroundColor: theme.card,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: theme.border,
  },
  segItem: { flex: 1, height: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segActive: { backgroundColor: theme.accent },
  segText: { color: theme.muted, fontWeight: '700', fontSize: 15 },
  group: {
    backgroundColor: theme.card,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(198,255,61,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { color: theme.text, fontSize: 16, fontWeight: '700' },
  rowSub: { color: theme.muted, fontSize: 13, marginTop: 2 },
  chev: { color: theme.faint, fontSize: 24 },
  sep: { height: 1, backgroundColor: theme.border, marginLeft: 66 },
  note: { color: theme.faint, fontSize: 13, lineHeight: 19, marginTop: 10, paddingHorizontal: 4 },
  footer: { color: theme.faint, textAlign: 'center', marginTop: 40, fontSize: 12 },
});
