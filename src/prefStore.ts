import Storage from 'expo-sqlite/kv-store';

/**
 * Tiny synchronous key-value store for device preferences (language, light/dark mode).
 * Synchronous so the theme and language are known before any screen's styles are created.
 */
export function getPref(key: string): string | null {
  try {
    return Storage.getItemSync(`pref.${key}`);
  } catch {
    return null;
  }
}

export function setPref(key: string, value: string) {
  Storage.setItemSync(`pref.${key}`, value);
}
