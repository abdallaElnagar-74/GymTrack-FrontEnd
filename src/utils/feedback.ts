import { Platform, Vibration } from 'react-native';

import { ApiError } from '../api/http';
import { t } from '../i18n';
import { notify } from './confirm';

/**
 * Short vibrations for taps that matter (ticking a set, a new record).
 * Android only: iOS's Vibration API can only do one long buzz, which feels wrong for a tap.
 */
export const haptic = {
  tap: () => Platform.OS === 'android' && Vibration.vibrate(12),
  success: () => Platform.OS === 'android' && Vibration.vibrate([0, 18, 60, 28]),
  /** End of the rest timer: meant to be noticed, so also on iOS. */
  alarm: () => Platform.OS !== 'web' && Vibration.vibrate(Platform.OS === 'android' ? [0, 350, 150, 350] : 0),
};

/**
 * Tell the user an action failed. Connection problems and server errors are already
 * reported by the session (once every few seconds), so they're not shown twice.
 */
export function reportError(e: unknown, title = t('Something went wrong')) {
  if (e instanceof ApiError && (e.status === 0 || e.status === 401 || e.status >= 500)) return;
  notify(title, t(e instanceof Error ? e.message : String(e)));
}
