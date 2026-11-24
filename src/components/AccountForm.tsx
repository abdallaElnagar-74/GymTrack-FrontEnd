import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/src/components/ui';
import { configuredApiUrl } from '@/src/api/http';
import { theme } from '@/src/theme';

type Mode = 'login' | 'register';

/**
 * Email sign-in / sign-up, required before using the app. `fromGuest`: this phone has a guest
 * account from an earlier version — creating an account keeps its data, signing in adds it to that account.
 */
export function AccountForm({
  apiUrl,
  notice,
  fromGuest = false,
  fullScreen = false,
  onSubmit,
}: {
  apiUrl: string;
  notice?: string;
  fromGuest?: boolean;
  /** Shown as a whole screen (handles the status bar area). */
  fullScreen?: boolean;
  onSubmit: (apiUrl: string, email: string, password: string, mode: Mode) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>(fromGuest ? 'register' : 'login');
  // When the build sets EXPO_PUBLIC_API_URL, every request goes there, so the field is fixed.
  const fixedUrl = configuredApiUrl();
  const [typedUrl, setUrl] = useState<string | null>(null);
  const url = fixedUrl || (typedUrl ?? apiUrl);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!url.trim()) return setError('Enter the server address.');
    if (!email.trim() || !password) return setError('Enter your email and password.');
    setBusy(true);
    try {
      await onSubmit(url, email.trim(), password, mode);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: fullScreen ? insets.top + 24 : 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{mode === 'login' ? 'Welcome back' : 'Create account'}</Text>
        <Text style={styles.sub}>
          Your exercises, plans and workouts are saved in your account in the cloud — safe if you lose your phone, and
          the same on every device.
        </Text>
        {notice ? <Text style={[styles.err, { marginTop: 12 }]}>{notice}</Text> : null}

        <View style={styles.segment}>
          {(['login', 'register'] as const).map((m) => (
            <Pressable key={m} onPress={() => setMode(m)} style={[styles.segItem, mode === m && styles.segActive]}>
              <Text style={[styles.segText, mode === m && { color: theme.onAccent }]}>
                {m === 'login' ? 'Sign in' : 'Create account'}
              </Text>
            </Pressable>
          ))}
        </View>

        {!fixedUrl && (
          <>
            <Text style={styles.label}>Server address</Text>
            <TextInput
              style={styles.input}
              value={url}
              onChangeText={setUrl}
              placeholder="http://192.168.1.10:4000"
              placeholderTextColor={theme.faint}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </>
        )}

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
          title={busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          size="lg"
          onPress={busy ? () => {} : submit}
          style={{ marginTop: 22 }}
        />
        {fromGuest && (
          <Text style={styles.note}>
            {mode === 'login'
              ? 'The workouts you logged on this phone are added to that account.'
              : 'Your workouts so far are kept in the new account.'}
          </Text>
        )}
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
  err: { color: theme.danger, marginTop: 6 },
  note: { color: theme.faint, fontSize: 12, textAlign: 'center', marginTop: 12 },
});
