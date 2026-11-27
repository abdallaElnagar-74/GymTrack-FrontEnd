import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AccountForm } from '@/src/components/AccountForm';
import { theme } from '@/src/theme';
import { notify } from '@/src/utils/confirm';
import { ApiError, apiRequest, configuredApiUrl, normalizeUrl, resolveApiUrl } from './http';
import { migrateLegacyData } from './legacy';
import { clearSession, isDeviceAccount, latestTokens, loadSession, refreshSession, resumeGuest, signInWithEmail, type Session } from './session';
import { t } from '@/src/i18n';

/** Client for the backend's data API (`/api/...`). Every call goes to MongoDB through the server. */
export type Api = {
  get<T>(path: string): Promise<T>;
  post<T = void>(path: string, body?: unknown): Promise<T>;
  patch(path: string, body: unknown): Promise<void>;
  put(path: string, body: unknown): Promise<void>;
  del(path: string): Promise<void>;
};

type Status = 'loading' | 'ready' | 'signedOut' | 'error';

type SessionState = {
  api: Api;
  platformApi: Api;
  organizationApi: (id: string) => Api;
  email: string;
  apiUrl: string;
  isGuest: boolean;
  signIn: (apiUrl: string, email: string, password: string, mode: 'login' | 'register') => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<SessionState | null>(null);

/** Shows a connection error at most every few seconds, instead of once per failed request. */
let lastAlert = 0;
function reportConnectionError(message: string) {
  if (Date.now() - lastAlert < 8000) return;
  lastAlert = Date.now();
  notify(t('Connection problem'), t(message));
}

/**
 * Connects to the backend before showing the app: reuses the saved session, or signs in to
 * this device's guest account, or asks the user to sign in (after they signed out on purpose).
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  // Changes whenever the account changes, so every screen remounts and loads that account's data.
  const [epoch, setEpoch] = useState(0);
  const initRunning = useRef(false);

  const init = useCallback(async () => {
    if (initRunning.current) return;
    initRunning.current = true;
    try {
      try {
        await migrateLegacyData();
      } catch (e: any) {
        console.warn('[legacy] upload of on-phone data failed, will retry next launch:', e?.message ?? e);
      }

      let s = await loadSession();
      const configured = configuredApiUrl();
      // Session for a different server than this build uses (e.g. switched local -> production).
      if (s && configured && normalizeUrl(s.apiUrl) !== configured) {
        await clearSession();
        s = null;
      }
      if (s) {
        try {
          await apiRequest(s.apiUrl, '/auth/me', { token: s.token, timeoutMs: 15000 });
        } catch (e) {
          if (!(e instanceof ApiError && e.status === 401)) throw e;
          // Platform API: the 15-minute access token ran out — renew it with the refresh token.
          const renewed = await refreshSession(s);
          if (renewed) s = renewed;
          else {
            // Expired or account deleted. A guest logs back in below; an email account must sign in again.
            await clearSession();
            if (!isDeviceAccount(s.email)) setError(t('Your session expired. Please sign in again.'));
            s = null;
          }
        }
      }
      // An account is required. A guest account made by an earlier version is kept (logged in)
      // so that registering / signing in carries its workouts over, but the app isn't usable as a guest.
      const url = resolveApiUrl(s?.apiUrl ?? '');
      if (!s && url) s = await resumeGuest(url);
      if (!s || isDeviceAccount(s.email)) {
        setSession(s);
        if (s) setError(t('Create an account or sign in to keep the workouts on this phone.'));
        setStatus('signedOut');
        return;
      }
      console.log(`[api] connected to ${s.apiUrl}`);
      setSession(s);
      setEpoch((n) => n + 1);
      setStatus('ready');
    } catch (e: any) {
      console.warn('[api] could not connect:', e?.message ?? e);
      setError(t(String(e?.message ?? e)));
      setStatus('error');
    } finally {
      initRunning.current = false;
    }
  }, []);

  useEffect(() => {
    // Started from a timer (not synchronously in the effect); the cleanup avoids a double start in StrictMode.
    const t = setTimeout(init, 0);
    return () => clearTimeout(t);
  }, [init]);

  const retry = useCallback(() => {
    setStatus('loading');
    init();
  }, [init]);

  const onUnauthorized = useCallback(async () => {
    await clearSession();
    setError(t('Your session expired. Please sign in again.'));
    setSession(null);
    setStatus('signedOut');
  }, []);

  const { api, platformApi, organizationApi } = useMemo(() => {
    const create = (prefix: string, workspaceId?: string): Api => {
    let scoped: { base: string; token: string; expires: number } | undefined;
    const send = async <T,>(s: Session, method: string, path: string, body?: unknown) => {
      if (workspaceId && (!scoped || scoped.base !== s.token || scoped.expires <= Date.now() + 30000)) {
        const r = await apiRequest<{ accessToken: string; accessTokenExpiresAt: string }>(s.apiUrl, '/auth/workspace-access', { method: 'POST', body: { workspaceId }, token: s.token });
        scoped = { base: s.token, token: r.accessToken, expires: Date.parse(r.accessTokenExpiresAt) };
      }
      return apiRequest<T>(s.apiUrl, `${prefix}${path}`, { method, body, token: scoped?.token ?? s.token });
    };

    const request = async <T,>(method: string, path: string, body?: unknown): Promise<T> => {
      if (!session) throw new ApiError(401, 'Not signed in');
      const s = latestTokens(session); // refreshed tokens are used without re-rendering the screens
      try {
        try {
          return await send<T>(s, method, path, body);
        } catch (e) {
          if (!(e instanceof ApiError && e.status === 401 && s.refreshToken)) throw e;
          // Access token expired (platform API, 15 min): renew once and repeat the request.
          const renewed = await refreshSession(s);
          if (!renewed) throw e;
          return await send<T>(renewed, method, path, body);
        }
      } catch (e) {
        if (e instanceof ApiError) {
          if (e.status === 401) onUnauthorized();
          else if (e.status === 0 || e.status >= 500) reportConnectionError(e.message);
        }
        throw e;
      }
    };
    return {
      get: (p) => request('GET', p),
      post: (p, b) => request('POST', p, b ?? {}),
      patch: (p, b) => request('PATCH', p, b),
      put: (p, b) => request('PUT', p, b),
      del: (p) => request('DELETE', p),
    };
    };
    return { api: create('/api'), platformApi: create(''), organizationApi: (id: string) => create('', id) };
  }, [session, onUnauthorized]);

  const signIn = useCallback(
    async (url: string, mail: string, password: string, mode: 'login' | 'register') => {
      const s = await signInWithEmail(normalizeUrl(url), mail, password, mode, session);
      setError('');
      setSession(s);
      setEpoch((n) => n + 1);
      setStatus('ready');
    },
    [session]
  );

  const signOut = useCallback(async () => {
    await clearSession();
    setError('');
    setSession(null);
    setStatus('signedOut');
  }, []);

  if (status === 'loading') {
    return (
      <View style={styles.wrap}>
        <ActivityIndicator color={theme.accent} size="large" />
        <Text style={[styles.body, { marginTop: 16 }]}>{t('Connecting…')}</Text>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>{t('Can’t reach the server')}</Text>
        <Text style={styles.body}>
          {t('GymTrack keeps your workouts in the cloud, so it needs an internet connection.')}{'\n\n'}
          {error}
        </Text>
        <Pressable style={styles.btn} onPress={retry}>
          <Text style={styles.btnText}>{t('Retry')}</Text>
        </Pressable>
      </View>
    );
  }

  if (status === 'signedOut') {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        <AccountForm
          apiUrl={resolveApiUrl(session?.apiUrl ?? '')}
          notice={error || undefined}
          fromGuest={!!session && isDeviceAccount(session.email)}
          fullScreen
          onSubmit={(url, mail, pw, mode) => signIn(url, mail, pw, mode)}
        />
      </View>
    );
  }

  const value: SessionState = {
    api, platformApi, organizationApi,
    email: session!.email,
    apiUrl: session!.apiUrl,
    isGuest: isDeviceAccount(session!.email),
    signIn,
    signOut,
  };
  return (
    <Ctx.Provider value={value}>
      <Fragment key={epoch}>{children}</Fragment>
    </Ctx.Provider>
  );
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession must be used inside SessionProvider');
  return v;
}

/** The data API client for the signed-in account. */
export const useApi = () => useSession().api;

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center', padding: 28 },
  title: { color: theme.text, fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 10 },
  body: { color: theme.muted, fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 420, marginBottom: 22 },
  btn: { backgroundColor: theme.fill, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 12 },
  btnText: { color: theme.onAccent, fontWeight: '800', fontSize: 15 },
});
