/** Web version of the preference store (see prefStore.ts). */
export function getPref(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(`pref.${key}`) ?? null;
  } catch {
    return null;
  }
}

export function setPref(key: string, value: string) {
  globalThis.localStorage?.setItem(`pref.${key}`, value);
}
