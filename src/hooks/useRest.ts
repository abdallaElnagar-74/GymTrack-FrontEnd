import { useSyncExternalStore } from 'react';

import type { Rest, UpNext } from '../components/RestTimer';

/**
 * The rest countdown between sets, shared by the workout list and the exercise screens, so it
 * keeps running when the app moves on to the next exercise.
 */
let current: Rest | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export const rest = {
  get: () => current,
  /** Start a rest of `seconds` (0 = rest timer off). `next`: what comes after it. */
  start(seconds: number, next?: UpNext) {
    if (seconds <= 0) return;
    current = { endsAt: Date.now() + seconds * 1000, total: seconds * 1000, next };
    emit();
  },
  adjust(deltaMs: number) {
    if (!current) return;
    const endsAt = Math.max(Date.now(), current.endsAt + deltaMs);
    current = { ...current, endsAt, total: Math.max(current.total + deltaMs, endsAt - Date.now(), 1) };
    emit();
  },
  clear() {
    if (!current) return;
    current = null;
    emit();
  },
};

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** The running rest, or null. */
export function useRest() {
  return useSyncExternalStore(subscribe, rest.get, rest.get);
}
