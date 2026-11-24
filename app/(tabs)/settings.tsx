import { useState } from 'react';
import Constants from 'expo-constants';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { confirm, notify } from '@/src/utils/confirm';
import { reportError } from '@/src/utils/feedback';
import { useSession } from '@/src/api/SessionContext';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

import { ScreenHeader, SectionTitle } from '@/src/components/ui';
import { exportAll, importAll, type BackupFile } from '@/src/db/queries';
import { theme } from '@/src/theme';
import { useUnit } from '@/src/UnitContext';
import type { Unit } from '@/src/utils/format';

const REST_OPTIONS = [
  { seconds: 0, label: 'Off' },
  { seconds: 60, label: '1:00' },
  { seconds: 90, label: '1:30' },
  { seconds: 120, label: '2:00' },
  { seconds: 180, label: '3:00' },
];

export default function SettingsScreen() {
  const session = useSession();
  const { api } = session;
  const { unit, setUnit, restSeconds, setRestSeconds } = useUnit();
  const [busy, setBusy] = useState(false);

  const onExport = async () => {
    try {
      setBusy(true);
      const data = await exportAll(api);
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
      await importAll(api, data);
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
        <SectionTitle>Account</SectionTitle>
        <Text style={styles.serverLine} numberOfLines={1}>
          Server: {session.apiUrl} · <Text style={{ color: theme.accent }}>connected</Text>
        </Text>
        <View style={styles.group}>
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <Text style={{ color: theme.accent, fontSize: 18 }}>☁</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {session.email}
              </Text>
              <Text style={styles.rowSub} numberOfLines={2}>
                Saved in the cloud · same data on every device
              </Text>
            </View>
          </View>
          <View style={styles.sep} />
          <Row
            icon="⎋"
            title="Sign out"
            sub="Your data stays in your account"
            onPress={() =>
              confirm('Sign out?', 'Sign in again with the same email to get your data back.', 'Sign out', () =>
                session.signOut()
              )
            }
          />
        </View>

        <SectionTitle>Weight unit</SectionTitle>
        <View style={styles.segment}>
          {(['kg', 'lb'] as Unit[]).map((u) => {
            const active = unit === u;
            return (
              <Pressable
                key={u}
                onPress={() => setUnit(u).catch(reportError)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.segItem, active && styles.segActive]}>
                <Text style={[styles.segText, active && { color: theme.onAccent }]}>
                  {u === 'kg' ? 'Kilograms (kg)' : 'Pounds (lb)'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <SectionTitle>Rest timer</SectionTitle>
        <View style={styles.segment}>
          {REST_OPTIONS.map((o) => {
            const active = restSeconds === o.seconds;
            return (
              <Pressable
                key={o.seconds}
                onPress={() => setRestSeconds(o.seconds).catch(reportError)}
                accessibilityRole="button"
                accessibilityLabel={o.seconds ? `Rest timer ${o.label}` : 'Rest timer off'}
                accessibilityState={{ selected: active }}
                style={[styles.segItem, active && styles.segActive]}>
                <Text style={[styles.segText, active && { color: theme.onAccent }]}>{o.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.note}>Starts when you tick a set ✓. Vibrates when it’s time for the next set.</Text>

        <SectionTitle>Backup</SectionTitle>
        <View style={styles.group}>
          <Row icon="⬆" title="Export backup" sub={busy ? 'Working…' : 'Save all data to a file'} onPress={busy ? () => {} : onExport} />
          <View style={styles.sep} />
          <Row icon="⬇" title="Import backup" sub="Replace data from a backup file" onPress={onImport} />
        </View>
        <Text style={styles.note}>
          Your data is stored in the cloud database. A file backup is an extra copy you control.
        </Text>

        <Text style={styles.footer}>GymTrack · v{Constants.expoConfig?.version}</Text>
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
  serverLine: { color: theme.muted, fontSize: 12, marginBottom: 8, marginLeft: 4 },
  chev: { color: theme.faint, fontSize: 24 },
  sep: { height: 1, backgroundColor: theme.border, marginLeft: 66 },
  note: { color: theme.faint, fontSize: 13, lineHeight: 19, marginTop: 10, paddingHorizontal: 4 },
  footer: { color: theme.faint, textAlign: 'center', marginTop: 40, fontSize: 12 },
});
