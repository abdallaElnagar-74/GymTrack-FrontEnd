import type { SetKind, WorkoutSet } from '../db/queries';
import { t } from '../i18n';
import { mode, theme } from '../theme';

export const SET_KINDS: { kind: SetKind; label: string; short: string; color: string; hint: string }[] = [
  { kind: 'normal', label: t('Working set'), short: '#', color: theme.text, hint: t('Counts for records and volume') },
  { kind: 'warmup', label: t('Warm-up'), short: 'W', color: mode === 'light' ? '#d97a00' : '#ffb340', hint: t('Not counted in records or volume') },
  { kind: 'drop', label: t('Drop set'), short: 'D', color: mode === 'light' ? '#7a4fd6' : '#b18cff', hint: t('Lighter weight right after a set') },
];

export function kindInfo(kind: SetKind | undefined) {
  return SET_KINDS.find((k) => k.kind === kind) ?? SET_KINDS[0];
}

/** Labels for a list of sets: warm-ups "W", drop sets "D", working sets numbered 1, 2, 3… */
export function setLabels(sets: Pick<WorkoutSet, 'kind'>[]) {
  let n = 0;
  return sets.map((s) => (s.kind === 'warmup' ? 'W' : s.kind === 'drop' ? 'D' : String(++n)));
}

/** Position of each set among sets of the same kind (0-based), used to match "last time" sets. */
export function kindOrdinals(sets: Pick<WorkoutSet, 'kind'>[]) {
  const counts: Record<string, number> = {};
  return sets.map((s) => {
    const k = s.kind ?? 'normal';
    const i = counts[k] ?? 0;
    counts[k] = i + 1;
    return i;
  });
}

/** Volume ignores warm-ups. */
export function setVolume(s: Pick<WorkoutSet, 'kind' | 'reps' | 'weight_kg'>) {
  return s.kind === 'warmup' ? 0 : s.reps * s.weight_kg;
}
