import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/src/components/ui';
import { configuredApiUrl } from '@/src/api/http';
import { Logo } from '@/src/components/Logo';
import { PrefToggles } from '@/src/components/PrefToggles';
import { isRTL, t } from '@/src/i18n';
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
  // The server comes from the build (EXPO_PUBLIC_API_URL); it is never shown or typed by the user.
  const url = configuredApiUrl() || apiUrl;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!url.trim()) return setError(t('Can’t reach the server. Check your internet connection.'));
    if (!email.trim() || !password) return setError(t('Enter your email and password.'));
    setBusy(true);
    try {
      await onSubmit(url, email.trim(), password, mode);
    } catch (e: any) {
      setError(t(String(e?.message ?? e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: fullScreen ? insets.top + 24 : 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled">
        <PrefToggles />
        <Logo size={150} style={{ alignSelf: 'center', marginTop: 8, marginBottom: 4 }} />
        <Text style={styles.title}>{mode === 'login' ? t('Welcome back') : t('Create account')}</Text>
        <Text style={styles.sub}>
          {t('Your exercises, plans and workouts are saved in your account — safe if you lose your phone, and the same on every device.')}
        </Text>
        {notice ? <Text style={[styles.err, { marginTop: 12 }]}>{notice}</Text> : null}

        <View style={styles.segment}>
          {(['login', 'register'] as const).map((m) => (
            <Pressable key={m} onPress={() => setMode(m)} style={[styles.segItem, mode === m && styles.segActive]}>
              <Text style={[styles.segText, mode === m && { color: theme.onAccent }]}>
                {m === 'login' ? t('Sign in') : t('Create account')}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>{t('Email')}</Text>
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

        <Text style={styles.label}>{t('Password')}</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder={mode === 'register' ? t('At least 8 characters') : t('Your password')}
          placeholderTextColor={theme.faint}
          secureTextEntry
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          onSubmitEditing={submit}
        />

        {error && <Text style={[styles.err, { marginTop: 14 }]}>{error}</Text>}

        <Button
          title={busy ? t('Please wait…') : mode === 'login' ? t('Sign in') : t('Create account')}
          size="lg"
          onPress={busy ? () => {} : submit}
          style={{ marginTop: 22 }}
        />
        {fromGuest && (
          <Text style={styles.note}>
            {mode === 'login'
              ? t('The workouts you logged on this phone are added to that account.')
              : t('Your workouts so far are kept in the new account.')}
          </Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  title: { color: theme.text, fontSize: 28, fontWeight: '800', textAlign: 'center' },
  sub: { color: theme.muted, marginTop: 6, lineHeight: 20, textAlign: 'center' },
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
  segActive: { backgroundColor: theme.fill },
  segText: { color: theme.muted, fontWeight: '700' },
  label: { color: theme.muted, fontSize: 12, fontWeight: '800', letterSpacing: isRTL ? 0 : 1, marginTop: 18, marginBottom: 6, textTransform: 'uppercase' },
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
