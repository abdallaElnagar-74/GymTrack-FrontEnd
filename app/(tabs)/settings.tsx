import { useState } from 'react';
import Constants from 'expo-constants';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { confirm, notify } from '@/src/utils/confirm';
import { reportError } from '@/src/utils/feedback';
import { useSession } from '@/src/api/SessionContext';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

import { Logo } from '@/src/components/Logo';
import { LanguageSegment, ModeSegment } from '@/src/components/PrefToggles';
import { ScreenHeader, SectionTitle } from '@/src/components/ui';
import { exportAll, importAll, type BackupFile } from '@/src/db/queries';
import { isRTL, t } from '@/src/i18n';
import { alpha, theme } from '@/src/theme';
import { useUnit } from '@/src/UnitContext';
import type { Unit } from '@/src/utils/format';

const REST_OPTIONS = [
  { seconds: 0, label: t('Off') },
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
        await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: t('Save GymTrack backup') });
      } else {
        notify(t('Sharing unavailable'), t('Cannot share files on this device.'));
      }
    } catch (e: any) {
      notify(t('Export failed'), String(e?.message ?? e));
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
      notify(t('Backup restored'), t('Your workouts were imported.'));
    } catch (e: any) {
      notify(t('Import failed'), String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const onImport = () =>
    confirm(t('Restore backup?'), t('This replaces ALL current data with the backup file.'), t('Restore'), doImport, {
      destructive: true,
    });

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScreenHeader title={t('Settings')} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 32 }}>
        <SectionTitle>{t('Language')}</SectionTitle>
        <LanguageSegment />

        <SectionTitle>{t('Appearance')}</SectionTitle>
        <ModeSegment />
        <Text style={styles.note}>{t('The app restarts to apply the change.')}</Text>

        <SectionTitle>{t('Weight unit')}</SectionTitle>
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
                  {u === 'kg' ? t('Kilograms (kg)') : t('Pounds (lb)')}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <SectionTitle>{t('Rest timer')}</SectionTitle>
        <View style={styles.segment}>
          {REST_OPTIONS.map((o) => {
            const active = restSeconds === o.seconds;
            return (
              <Pressable
                key={o.seconds}
                onPress={() => setRestSeconds(o.seconds).catch(reportError)}
                accessibilityRole="button"
                accessibilityLabel={o.seconds ? `${t('Rest timer')} ${o.label}` : t('Rest timer off')}
                accessibilityState={{ selected: active }}
                style={[styles.segItem, active && styles.segActive]}>
                <Text style={[styles.segText, active && { color: theme.onAccent }]}>{o.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.note}>{t('Starts when you finish a set ✓. Vibrates when it’s time for the next set.')}</Text>

        <SectionTitle>{t('Backup')}</SectionTitle>
        <View style={styles.group}>
          <Row
            icon="⬆"
            title={t('Export backup')}
            sub={busy ? t('Working…') : t('Save all data to a file')}
            onPress={busy ? () => {} : onExport}
          />
          <View style={styles.sep} />
          <Row icon="⬇" title={t('Import backup')} sub={t('Replace data from a backup file')} onPress={onImport} />
        </View>

        <SectionTitle>{t('Account')}</SectionTitle>
        <View style={styles.group}>
          <Row
            icon="⎋"
            title={t('Sign out')}
            sub={session.email}
            danger
            onPress={() =>
              confirm(t('Sign out?'), t('Sign in again with the same email to get your data back.'), t('Sign out'), () =>
                session.signOut()
              )
            }
          />
        </View>

        <View style={styles.about}>
          <Logo size={96} />
          <Text style={styles.footer}>GymTrack · v{Constants.expoConfig?.version}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Row({
  icon,
  title,
  sub,
  danger,
  onPress,
}: {
  icon: string;
  title: string;
  sub: string;
  danger?: boolean;
  onPress: () => void;
}) {
  const color = danger ? theme.danger : theme.accent;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.cardAlt }]}>
      <View style={[styles.rowIcon, { backgroundColor: alpha(color, 0.12) }]}>
        <Text style={{ color, fontSize: 18, fontWeight: '800' }}>{icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, danger && { color: theme.danger }]}>{title}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <Text style={styles.chev}>{isRTL ? '‹' : '›'}</Text>
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { color: theme.text, fontSize: 16, fontWeight: '700' },
  rowSub: { color: theme.muted, fontSize: 13, marginTop: 2 },
  chev: { color: theme.faint, fontSize: 24 },
  sep: { height: 1, backgroundColor: theme.border, marginLeft: 66 },
  note: { color: theme.faint, fontSize: 13, lineHeight: 19, marginTop: 10, paddingHorizontal: 4 },
  about: { alignItems: 'center', marginTop: 36, gap: 6 },
  footer: { color: theme.faint, textAlign: 'center', fontSize: 12 },
});
