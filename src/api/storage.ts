import Storage from 'expo-sqlite/kv-store';

/**
 * Small key-value store for the sign-in session only (all app data lives on the server).
 * Native: expo-sqlite's key-value store. Web: see storage.web.ts.
 */
export const kv = {
  get: (key: string) => Storage.getItem(key),
  set: (key: string, value: string) => Storage.setItem(key, value),
  remove: (key: string) => Storage.removeItem(key),
};
