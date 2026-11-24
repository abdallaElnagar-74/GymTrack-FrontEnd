import { useCallback, useRef, useState } from 'react';
import { RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { theme } from '../theme';

/**
 * Loading state for a screen whose data comes from the server.
 * - Loads whenever the screen comes into focus (quietly, keeping what's shown).
 * - `status`: 'loading' only until the first load finishes, so a screen never flashes an
 *   "empty" message before its data arrives; 'error' only if nothing could be loaded yet.
 * - `refreshControl`: pull-to-refresh for the screen's ScrollView / FlatList.
 */
export function useScreenData(load: () => Promise<unknown>) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const loadedOnce = useRef(false);

  const reload = useCallback(async () => {
    try {
      await load();
      loadedOnce.current = true;
      setStatus('ready');
    } catch (e: any) {
      setError(String(e?.message ?? e));
      // Keep showing the old data if there is some; the session already reported the problem.
      if (!loadedOnce.current) setStatus('error');
    }
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);

  const retry = useCallback(async () => {
    setStatus('loading');
    await reload();
  }, [reload]);

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={theme.accent}
      colors={[theme.onAccent]}
      progressBackgroundColor={theme.accent}
    />
  );

  return { status, error, reload, retry, refreshControl };
}
