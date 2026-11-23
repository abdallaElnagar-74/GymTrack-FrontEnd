export const theme = {
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
  radius: 18,
};

export const groupColors: Record<string, string> = {
  Chest: '#ff6b6b',
  Back: '#4f9dff',
  Legs: '#c6ff3d',
  Shoulders: '#ffb547',
  Arms: '#b86bff',
  Core: '#3de0d0',
  Other: '#8a91a3',
};

export const groupColor = (g: string) => groupColors[g] ?? groupColors.Other;
