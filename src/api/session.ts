import { ApiError, apiRequest } from './http';
import { kv } from './storage';

/**
 * The sign-in session. This (plus the guest credentials below) is the ONLY thing the app
 * keeps on the device; all workout data lives in the backend's MongoDB database.
 */
export type Session = { apiUrl: string; token: string; email: string };

/** Credentials of this device's guest account, so it can log back in when the token expires. */
type Device = { email: string; password: string };

const KEYS = { session: 'gym.session', device: 'gym.device', autoLink: 'gym.autoLink' };

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const v = await kv.get(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

export const loadSession = () => readJson<Session>(KEYS.session);
export const saveSession = (s: Session) => kv.set(KEYS.session, JSON.stringify(s));
export const clearSession = () => kv.remove(KEYS.session);

export const loadDevice = () => readJson<Device>(KEYS.device);
export const saveDevice = (d: Device) => kv.set(KEYS.device, JSON.stringify(d));
const clearDevice = () => kv.remove(KEYS.device);

/** false after the user signs out on purpose: then the app asks them to sign in instead of using a guest account. */
export const getAutoLink = async () => (await kv.get(KEYS.autoLink)) !== '0';
export const setAutoLink = (on: boolean) => kv.set(KEYS.autoLink, on ? '1' : '0');

const DEVICE_DOMAIN = 'devices.gymtracker.app';

/** True for the guest account the app created by itself (not one the user signed in with). */
export const isDeviceAccount = (email: string) => email.endsWith(`@${DEVICE_DOMAIN}`);

type AuthResponse = { token: string; user: { id: string; email: string }; password?: string };

export function authCall(apiUrl: string, path: string, body: unknown, token?: string) {
  return apiRequest<AuthResponse>(apiUrl, `/auth/${path}`, { method: 'POST', body, token });
}

async function start(apiUrl: string, r: AuthResponse): Promise<Session> {
  const s = { apiUrl, token: r.token, email: r.user.email };
  await saveSession(s);
  return s;
}

/**
 * Sign in to the guest account an earlier app version made on this phone, if there is one
 * (never creates one). The user is then asked to register or sign in, which keeps its data.
 */
export async function resumeGuest(apiUrl: string): Promise<Session | null> {
  const dev = await loadDevice();
  if (!dev) return null;
  try {
    return await start(apiUrl, await authCall(apiUrl, 'login', dev));
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      await clearDevice(); // gone from the server: nothing to keep
      return null;
    }
    throw e;
  }
}

/** Sign in to this device's guest account, creating one if there is none yet. */
export async function linkGuest(apiUrl: string, { seed = true } = {}): Promise<Session> {
  const dev = await loadDevice();
  if (dev) {
    try {
      return await start(apiUrl, await authCall(apiUrl, 'login', dev));
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) throw e;
      // The guest account is gone from the server (e.g. database reset): make a new one.
    }
  }
  const r = await authCall(apiUrl, 'guest', { seed });
  await saveDevice({ email: r.user.email, password: r.password! });
  await setAutoLink(true);
  return start(apiUrl, r);
}

/** Use the guest credentials an older app version created (kept in its on-phone database). */
export async function linkLegacyDevice(apiUrl: string, dev: Device): Promise<Session> {
  await saveDevice(dev);
  try {
    return await start(apiUrl, await authCall(apiUrl, 'login', dev));
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 401)) throw e;
    // Never reached the server before: register it now, empty (its exercises are uploaded next).
    return start(apiUrl, await authCall(apiUrl, 'register', { ...dev, seed: false }));
  }
}

/**
 * Sign in with email. From a guest account, "register" turns the guest into that account and
 * "login" moves the guest's data into the existing account — either way nothing is lost.
 */
export async function signInWithEmail(
  apiUrl: string,
  email: string,
  password: string,
  mode: 'login' | 'register',
  current: Session | null
): Promise<Session> {
  const fromGuest = current && isDeviceAccount(current.email) && current.apiUrl === apiUrl;
  const path = fromGuest ? (mode === 'register' ? 'upgrade' : 'merge') : mode;
  const r = await authCall(apiUrl, path, { email, password }, fromGuest ? current.token : undefined);
  if (fromGuest) await clearDevice();
  return start(apiUrl, r);
}
