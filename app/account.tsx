import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';

import { Button } from '@/src/components/ui';
import { checkServer } from '@/src/sync/engine';
import { useSync } from '@/src/sync/SyncContext';
import { theme } from '@/src/theme';

export default function AccountScreen() {
  const { apiUrl, signIn } = useSync();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [url, setUrl] = useState(apiUrl);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverOk, setServerOk] = useState<boolean | null>(null);

  const testServer = async () => {
    setServerOk(null);
    try {
      await checkServer(url);
      setServerOk(true);
    } catch {
      setServerOk(false);
    }
  };

  const submit = async () => {
    setError(null);
    if (!url.trim()) return setError('Enter the server address.');
    if (!email.trim() || !password) return setError('Enter your email and password.');
    setBusy(true);
    try {
      await signIn(url, email.trim(), password, mode);
      router.back();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{mode === 'login' ? 'Welcome back' : 'Create account'}</Text>
        <Text style={styles.sub}>
          Sync your exercises, plans and workouts to the cloud — safe if you lose your phone, and shared across devices.
        </Text>

        <View style={styles.segment}>
          {(['login', 'register'] as const).map((m) => (
            <Pressable key={m} onPress={() => setMode(m)} style={[styles.segItem, mode === m && styles.segActive]}>
              <Text style={[styles.segText, mode === m && { color: theme.onAccent }]}>
                {m === 'login' ? 'Sign in' : 'Create account'}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Server address</Text>
        <View style={styles.urlRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={url}
            onChangeText={(t) => {
              setUrl(t);
              setServerOk(null);
            }}
            placeholder="http://192.168.1.10:4000"
            placeholderTextColor={theme.faint}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Pressable onPress={testServer} style={styles.testBtn}>
            <Text style={styles.testText}>{serverOk === true ? '✓' : serverOk === false ? '✕' : 'Test'}</Text>
          </Pressable>
        </View>
        {serverOk === false && <Text style={styles.err}>Can’t reach the server at this address.</Text>}
        {serverOk === true && <Text style={styles.ok}>Server is reachable.</Text>}

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={theme.faint}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'}
          placeholderTextColor={theme.faint}
          secureTextEntry
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          onSubmitEditing={submit}
        />

        {error && <Text style={[styles.err, { marginTop: 14 }]}>{error}</Text>}

        <Button
          title={busy ? 'Please wait…' : mode === 'login' ? 'Sign in & sync' : 'Create account & sync'}
          size="lg"
          onPress={busy ? () => {} : submit}
          style={{ marginTop: 22 }}
        />
        <Text style={styles.note}>
          Your workouts already on this phone are kept and uploaded to the account.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  title: { color: theme.text, fontSize: 28, fontWeight: '800' },
  sub: { color: theme.muted, marginTop: 6, lineHeight: 20 },
  segment: {
    flexDirection: 'row',
    backgroundColor: theme.card,
    borderRadius: 14,
    padding: 4,
    marginTop: 20,
    borderWidth: 1,
    borderColor: theme.border,
  },
  segItem: { flex: 1, height: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segActive: { backgroundColor: theme.accent },
  segText: { color: theme.muted, fontWeight: '700' },
  label: { color: theme.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1, marginTop: 18, marginBottom: 6, textTransform: 'uppercase' },
  input: {
    backgroundColor: theme.card,
    color: theme.text,
    borderRadius: 12,
    minHeight: 50,
    paddingHorizontal: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  urlRow: { flexDirection: 'row', gap: 8 },
  testBtn: {
    width: 64,
    borderRadius: 12,
    backgroundColor: theme.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testText: { color: theme.accent, fontWeight: '800' },
  err: { color: theme.danger, marginTop: 6 },
  ok: { color: theme.success, marginTop: 6 },
  note: { color: theme.faint, fontSize: 12, textAlign: 'center', marginTop: 12 },
});
