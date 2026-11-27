import Constants from 'expo-constants';
import { Platform } from 'react-native';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

/** Port the local backend listens on (backend/.env PORT). */
const DEV_API_PORT = 4000;

/**
 * Host of the computer running `npx expo start`, as seen from this device.
 * On a phone/emulator "localhost" is the device itself, so a local backend has to be
 * reached through the dev machine's address instead.
 */
function devMachineHost(): string {
  if (Platform.OS === 'web') return globalThis.location?.hostname || 'localhost';
  // e.g. "192.168.1.5:8081" while `npx expo start` is serving the app.
  const host = Constants.expoConfig?.hostUri?.split(':')[0] ?? '';
  if (!host || host.endsWith('.exp.direct')) return ''; // tunnel mode: the LAN IP is unknown
  if (host === 'localhost' || host === '127.0.0.1') {
    // The Android emulator reaches the computer's localhost via 10.0.2.2.
    return Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
  }
  return host;
}

/**
 * The backend URL configured for this build: `EXPO_PUBLIC_API_URL` from the project's `.env`
 * (development: http://localhost:4000; production: your deployed API). '' if not set.
 * In development on a phone/emulator, a "localhost" URL is pointed at the dev machine.
 */
export function configuredApiUrl(): string {
  const raw = process.env.EXPO_PUBLIC_API_URL;
  if (!raw) return '';
  const url = normalizeUrl(raw);
  if (!__DEV__ || Platform.OS === 'web') return url;
  const m = url.match(/^(https?:\/\/)(localhost|127\.0\.0\.1)(:\d+)?(.*)$/i);
  const host = devMachineHost();
  return m && host ? `${m[1]}${host}${m[3] ?? ''}${m[4]}` : url;
}

/** Server address shown on the sign-in screen when nothing is configured or saved. */
export function defaultApiUrl(): string {
  const configured = configuredApiUrl();
  if (configured) return configured;
  if (!__DEV__) return '';
  const host = devMachineHost();
  return host ? `http://${host}:${DEV_API_PORT}` : '';
}

/**
 * The backend every request goes to. The configured URL always wins; otherwise the address
 * the user signed in with (`saved`), otherwise the development default.
 */
export function resolveApiUrl(saved: string): string {
  return configuredApiUrl() || normalizeUrl(saved) || defaultApiUrl();
}

export function normalizeUrl(url: string) {
  let u = url.trim().replace(/\/+$/, '');
  if (u && !/^https?:\/\//i.test(u)) u = `http://${u}`;
  return u;
}

/**
 * The platform API answers errors with a code (ProblemDetails `code`, BRD I18N-01). These map to the messages
 * the app already shows (and translates with t()); unknown codes are shown as they are.
 */
const CODE_MESSAGES: Record<string, string> = {
  'member.phone_invalid': 'Enter a phone number with country code.',
  'member.type_conflict': 'Employees and clients must be separate.',
  'member.reservation_invalid': 'Reopen the form to generate a new number.',
  'member.duplicate': 'This person is already registered in this organization.',
  'member.subscription_overlap': 'These dates overlap another subscription.',
  'auth.invalid_credentials': 'Wrong email or password',
  'auth.email_taken': 'An account with this email already exists',
  'auth.account_inactive': 'This account is suspended.',
  'auth.unauthorized': 'Not signed in',
  'auth.session_revoked': 'Your session expired. Please sign in again.',
  'auth.refresh_reused': 'Your session expired. Please sign in again.',
  'auth.refresh_expired': 'Your session expired. Please sign in again.',
  'validation.email_invalid': 'Enter a valid email address',
  'validation.password_too_short': 'Password must be at least 8 characters',
  'validation.password_too_long': 'Password is too long',
  'training.exercise_name_taken': 'An exercise with that name already exists',
  'validation.name_required': 'Name is required',
  'validation.youtube_link_required': 'This link is not a valid YouTube video.',
  'validation.technique_name_required': 'Give each technique a name.',
  'backup.not_a_backup': 'This file is not a GymTrack backup.',
  'auth.mfa_required': 'Enter the code from your authenticator app.',
  'auth.mfa_invalid': 'That code is not right. Check the time on your phone and try again.',
  'auth.user_not_found': 'This account no longer exists.',
  'auth.refresh_invalid': 'Your session expired. Please sign in again.',
  'auth.session_not_found': 'Your session expired. Please sign in again.',
  'access.denied': 'You are not allowed to do this.',
  'access.no_workspace': 'This workspace is not available to you.',
  'access.workspace_not_found': 'This workspace is not available to you.',
  'training.exercise_not_found': 'This item no longer exists. Pull down to refresh.',
  'training.video_not_found': 'This item no longer exists. Pull down to refresh.',
  'training.plan_not_found': 'This item no longer exists. Pull down to refresh.',
  'training.day_not_found': 'This item no longer exists. Pull down to refresh.',
  'training.day_exercise_not_found': 'This item no longer exists. Pull down to refresh.',
  'training.workout_not_found': 'This item no longer exists. Pull down to refresh.',
  'training.set_not_found': 'This item no longer exists. Pull down to refresh.',
  'validation.invalid': 'Some of the details are not valid.',
};

/** JSON request to the backend with a timeout and readable errors. */
export async function apiRequest<T>(
  baseUrl: string,
  path: string,
  opts: { method?: string; body?: unknown; token?: string; timeoutMs?: number } = {}
): Promise<T> {
  const method = opts.method ?? 'GET';
  const url = normalizeUrl(baseUrl) + path;
  if (!normalizeUrl(baseUrl)) throw new ApiError(0, 'No server address configured (set EXPO_PUBLIC_API_URL in .env).');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20000);
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal,
    });
  } catch (e) {
    if (__DEV__) console.warn(`[api] ${method} ${url} -> network error: ${(e as Error)?.message ?? e}`);
    throw new ApiError(0, "Can’t reach the server. Check your internet connection.");
  } finally {
    clearTimeout(timer);
  }
  if (__DEV__) console.log(`[api] ${method} ${url} -> ${res.status}`);
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const fieldErrors = data?.details?.fieldErrors as Record<string, string[]> | undefined;
    const first = fieldErrors && Object.values(fieldErrors).flat()[0];
    const coded = typeof data?.code === 'string' ? CODE_MESSAGES[data.code] ?? data.code : undefined;
    throw new ApiError(
      res.status,
      first || data?.error || coded || (res.status === 429 ? 'Too many attempts, try again later' : `Server error (${res.status})`)
    );
  }
  return data as T;
}
