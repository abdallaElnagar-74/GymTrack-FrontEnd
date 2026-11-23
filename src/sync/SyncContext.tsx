import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { getSyncMeta, signIn as engineSignIn, signOut as engineSignOut, syncNow } from './engine';

type SyncState = {
  email: string;
  apiUrl: string;
  lastSyncAt: number | null;
  syncing: boolean;
  error: string | null;
  /** Increments whenever a sync brought in remote changes — screens can reload on it. */
  tick: number;
  sync: () => Promise<void>;
  signIn: (apiUrl: string, email: string, password: string, mode: 'login' | 'register') => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<SyncState | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [email, setEmail] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const emailRef = useRef('');

  const refreshMeta = useCallback(async () => {
    const m = await getSyncMeta(db);
    emailRef.current = m.token ? m.email : '';
    setEmail(emailRef.current);
    setApiUrl(m.api_url || process.env.EXPO_PUBLIC_API_URL || '');
    setLastSyncAt(m.last_sync_at);
  }, [db]);

  const sync = useCallback(async () => {
    if (!emailRef.current) return;
    setSyncing(true);
    try {
      const r = await syncNow(db);
      setError(null);
      if (r.pulled > 0) setTick((t) => t + 1);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setSyncing(false);
      await refreshMeta();
    }
  }, [db, refreshMeta]);

  // Sync on launch and whenever the app comes back to the foreground.
  useEffect(() => {
    refreshMeta().then(sync);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') sync();
    });
    return () => sub.remove();
  }, [refreshMeta, sync]);

  const signIn = useCallback(
    async (url: string, mail: string, password: string, mode: 'login' | 'register') => {
      await engineSignIn(db, url, mail, password, mode);
      await refreshMeta();
      await sync();
      setTick((t) => t + 1);
    },
    [db, refreshMeta, sync]
  );

  const signOut = useCallback(async () => {
    await engineSignOut(db);
    setError(null);
    await refreshMeta();
  }, [db, refreshMeta]);

  return (
    <Ctx.Provider value={{ email, apiUrl, lastSyncAt, syncing, error, tick, sync, signIn, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSync() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSync must be used inside SyncProvider');
  return v;
}

/** Re-run `load` after a sync brings in changes from another device. */
export function useReloadOnSync(load: () => unknown) {
  const { tick } = useSync();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);
}
