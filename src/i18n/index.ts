import { reloadAppAsync } from 'expo';
import { I18nManager, Platform } from 'react-native';

import { getPref, setPref } from '../prefStore';
import type { ModeChoice } from '../theme';
import { ar } from './ar';

/**
 * English / Arabic. The language is a device preference read once at start-up (default: the
 * phone's language). Changing it saves it and reloads the app, which also switches the layout
 * direction (Arabic is right-to-left).
 *
 * Texts are written in English in the code and wrapped in t(); `ar.ts` maps them to Arabic.
 * Missing translations fall back to English. `{name}` placeholders are filled from `vars`.
 */
export type Lang = 'en' | 'ar';

function deviceLang(): Lang {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith('ar') ? 'ar' : 'en';
  } catch {
    return 'en';
  }
}

const stored = getPref('lang');
export const lang: Lang = stored === 'ar' || stored === 'en' ? stored : deviceLang();
export const isRTL = lang === 'ar';
/** Locale for dates and numbers (Arabic month names with Western digits). */
export const locale = isRTL ? 'ar-EG-u-nu-latn' : 'en-US';

export function t(en: string, vars?: Record<string, string | number>): string {
  let s = isRTL ? (ar[en] ?? en) : en;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
}

/** "1 set" / "3 sets" style plurals: `one` and `other` are English keys of the dictionary. */
export function plural(n: number, one: string, other: string, vars?: Record<string, string | number>) {
  return t(n === 1 ? one : other, { n, ...vars });
}

function applyDirection(rtl: boolean) {
  if (Platform.OS === 'web') {
    if (typeof document !== 'undefined') document.documentElement.dir = rtl ? 'rtl' : 'ltr';
    return false;
  }
  if (I18nManager.isRTL === rtl) return false;
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
  return true;
}

/** Call once at start-up: makes the layout direction match the language (reloads if it changed). */
export function syncDirection() {
  if (applyDirection(isRTL)) reloadAppAsync('Layout direction changed').catch(() => {});
}

export async function setLanguage(next: Lang) {
  setPref('lang', next);
  applyDirection(next === 'ar');
  await reloadAppAsync('Language changed');
}

export async function setMode(next: ModeChoice) {
  setPref('mode', next);
  await reloadAppAsync('Theme changed');
}
