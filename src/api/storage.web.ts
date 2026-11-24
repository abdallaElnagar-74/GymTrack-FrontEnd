/** Web: the browser's localStorage (works in several tabs at once, unlike SQLite on web). */
function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback; // private mode / storage blocked
  }
}

export const kv = {
  get: async (key: string) => safe(() => globalThis.localStorage?.getItem(key) ?? null, null),
  set: async (key: string, value: string) => safe(() => globalThis.localStorage?.setItem(key, value), undefined),
  remove: async (key: string) => safe(() => globalThis.localStorage?.removeItem(key), undefined),
};
