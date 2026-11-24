import { Appearance } from 'react-native';

import { getPref } from './prefStore';

/**
 * Colours for dark and light mode, read once at start-up: the mode chosen in Settings, or the
 * phone's own dark / light setting if none was chosen. Changing it in Settings saves it and
 * reloads the app (see setMode in src/i18n).
 */
export type Mode = 'dark' | 'light';
/** What the user picked in Settings: a fixed mode, or 'system' to follow the phone. */
export type ModeChoice = Mode | 'system';
const chosen = getPref('mode');
export const modeChoice: ModeChoice = chosen === 'light' || chosen === 'dark' ? chosen : 'system';
export const mode: Mode =
  chosen === 'light' || chosen === 'dark' ? chosen : Appearance.getColorScheme() === 'light' ? 'light' : 'dark';

const dark = {
  bg: '#0a0b0f',
  card: '#15171e',
  cardAlt: '#1e212b',
  input: '#0f1116',
  border: '#262a36',
  text: '#f5f7fb',
  muted: '#8a91a3',
  faint: '#5a6172',
  accent: '#c6ff3d', // neon lime
  accentDark: '#8fd400',
  onAccent: '#0a0b0f',
  blue: '#4f9dff',
  success: '#34d27b',
  danger: '#ff5a5f',
  gold: '#ffc83d',
  heroFrom: '#1f2a0a',
  heroTo: '#141a08',
  radius: 18,
};

const light: typeof dark = {
  bg: '#f3f5f9',
  card: '#ffffff',
  cardAlt: '#eef1f6',
  input: '#f6f8fb',
  border: '#dfe3eb',
  text: '#0f1218',
  muted: '#5b6273',
  faint: '#8f96a6',
  accent: '#4f8f00', // deeper lime so text and icons stay readable on white
  accentDark: '#3d7000',
  onAccent: '#ffffff',
  blue: '#2f7de1',
  success: '#1f9d57',
  danger: '#e0393e',
  gold: '#c98a00',
  heroFrom: '#eef8dc',
  heroTo: '#f6fbec',
  radius: 18,
};

export const theme = mode === 'light' ? light : dark;

/** `hex` colour with opacity `a` (0–1), e.g. alpha(theme.accent, 0.14). */
export function alpha(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export const groupColors: Record<string, string> =
  mode === 'light'
    ? {
        Chest: '#e5484d',
        Back: '#2f7de1',
        Legs: '#4f8f00',
        Shoulders: '#d97a00',
        Arms: '#8e4ec6',
        Core: '#0f9f95',
        Other: '#5b6273',
      }
    : {
        Chest: '#ff6b6b',
        Back: '#4f9dff',
        Legs: '#c6ff3d',
        Shoulders: '#ffb547',
        Arms: '#b86bff',
        Core: '#3de0d0',
        Other: '#8a91a3',
      };

export const groupColor = (g: string) => groupColors[g] ?? groupColors.Other;
