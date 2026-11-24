#!/usr/bin/env node
/**
 * Frontend <-> backend compatibility check.
 *
 *   npm run check:backend                      # uses EXPO_PUBLIC_API_URL from .env.development
 *   npm run check:backend -- https://my-api    # any other backend (e.g. production)
 *
 * Uses the app's own wire format (src/api/legacyWire.ts) and walks through everything the app
 * does: health, register/login/me, push every table with every column, pull it back and
 * compare, last-write-wins, delete cascades. Creates a throwaway account and deletes it.
 * Exit code 0 = compatible, 1 = not.
 */
import { readFileSync } from 'node:fs';
import { WIRE } from '../src/api/legacyWire.ts';

function apiUrlFromEnvFile() {
  try {
    const text = readFileSync(new URL('../.env.development', import.meta.url), 'utf8');
    return text.match(/^\s*EXPO_PUBLIC_API_URL\s*=\s*(\S+)/m)?.[1] ?? '';
  } catch {
    return '';
  }
}

const API = (process.argv[2] || apiUrlFromEnvFile()).replace(/\/+$/, '');
if (!API) {
  console.error('No API URL: pass one as an argument or set EXPO_PUBLIC_API_URL in .env.development');
  process.exit(1);
}

let failures = 0;
const ok = (msg) => console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
const fail = (msg) => {
  failures++;
  console.log(`  \x1b[31m✗ ${msg}\x1b[0m`);
};
const check = (cond, msg) => (cond ? ok(msg) : fail(msg));

async function call(method, path, body, token) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'content-type': 'application/json',
      // Same as the web app, so CORS is exercised too.
      origin: 'http://localhost:8081',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  return { status: res.status, body: data, cors: res.headers.get('access-control-allow-origin') };
}

// One sample row per table, every wire column filled, references pointing at each other.
const now = Date.now();
const ID = {
  exercises: 'cx',
  exercise_videos: 'cv',
  routines: 'cr',
  routine_days: 'cd',
  routine_day_exercises: 'cde',
  workouts: 'cw',
  workout_sets: 'cs',
};
const SAMPLE = {
  name: 'Compat check',
  muscle_group: 'Chest',
  created_at: now - 1000,
  source: 'youtube',
  url: 'https://youtu.be/dQw4w9WgXcQ',
  title: 'Form tips',
  position: 2,
  target_sets: 4,
  date: now - 5000,
  notes: 'compat notes',
  finished_at: now - 100,
  set_number: 1,
  reps: 10,
  weight_kg: 62.5,
  done: 1,
  kind: 'warmup',
};
function sampleRow(table) {
  const { cols, refs } = WIRE[table];
  const row = { id: ID[table], updated_at: now };
  for (const c of cols) row[c] = refs[c] ? ID[refs[c]] : SAMPLE[c];
  for (const c of cols) if (row[c] === undefined) throw new Error(`No sample value for ${table}.${c}: add it to SAMPLE`);
  return row;
}

console.log(`\nChecking backend at ${API}\n`);

try {
  console.log('Connection');
  const health = await call('GET', '/health');
  check(health.status === 200 && health.body?.ok === true, `GET /health -> ${health.status}`);
  check(!!health.cors, `CORS allows the web app (Access-Control-Allow-Origin: ${health.cors ?? 'missing'})`);
  if (health.status !== 200) throw new Error('Backend not reachable; stopping.');

  console.log('Accounts');
  const email = `compat-${now}@example.com`;
  const reg = await call('POST', '/auth/register', { email, password: 'compat-password-123' });
  check(reg.status === 201 && typeof reg.body?.token === 'string' && reg.body?.user?.email === email, `POST /auth/register -> ${reg.status} { token, user }`);
  const token = reg.body?.token;
  const login = await call('POST', '/auth/login', { email, password: 'compat-password-123' });
  check(login.status === 200 && typeof login.body?.token === 'string', `POST /auth/login -> ${login.status}`);
  const me = await call('GET', '/auth/me', undefined, token);
  check(me.status === 200 && me.body?.user?.email === email, `GET /auth/me -> ${me.status}`);
  const dup = await call('POST', '/auth/register', { email, password: 'compat-password-123' });
  check(dup.status === 409, `duplicate register -> ${dup.status} (app expects 409)`);
  const noAuth = await call('GET', '/sync/pull?since=0');
  check(noAuth.status === 401, `sync without token -> ${noAuth.status} (app expects 401)`);

  console.log('Sync: push every table with every column the app sends');
  const tables = Object.keys(WIRE);
  const changes = Object.fromEntries(tables.map((t) => [t, [sampleRow(t)]]));
  const push = await call('POST', '/sync/push', { changes }, token);
  check(push.status === 200, `POST /sync/push -> ${push.status}${push.status !== 200 ? ' ' + JSON.stringify(push.body) : ''}`);
  check(push.body?.applied === tables.length, `applied ${push.body?.applied}/${tables.length} rows`);

  console.log('Sync: pull back and compare');
  const pull = await call('GET', '/sync/pull?since=0', undefined, token);
  check(pull.status === 200 && typeof pull.body?.version === 'number' && pull.body?.hasMore === false, `GET /sync/pull -> ${pull.status} { changes, version, hasMore }`);
  for (const t of tables) {
    const sent = changes[t][0];
    const got = pull.body?.changes?.[t]?.find((r) => r.id === sent.id);
    if (!got) {
      fail(`${t}: row missing from pull`);
      continue;
    }
    const wrong = [...WIRE[t].cols, 'updated_at'].filter((c) => got[c] !== sent[c]);
    const meta = ['deleted', 'version'].filter((c) => !(c in got));
    if (wrong.length || meta.length) {
      fail(`${t}: mismatched ${[...wrong.map((c) => `${c} (sent ${JSON.stringify(sent[c])}, got ${JSON.stringify(got[c])})`), ...meta.map((c) => `${c} missing`)].join(', ')}`);
    } else ok(`${t}: all ${WIRE[t].cols.length} columns round-trip`);
    const extra = Object.keys(got).filter((c) => !['id', 'updated_at', 'deleted', 'version', ...WIRE[t].cols].includes(c));
    if (extra.length) console.log(`    note: backend also returns ${extra.join(', ')} (ignored by the app)`);
  }

  console.log('Sync: conflict rules');
  const v = pull.body.version;
  const stale = await call('POST', '/sync/push', { changes: { exercises: [{ ...changes.exercises[0], name: 'stale', updated_at: now - 60_000 }] } }, token);
  check(stale.body?.applied === 0, 'older edit is ignored (last write wins)');
  const del = await call('POST', '/sync/push', { changes: { workouts: [{ id: ID.workouts, updated_at: now + 1, deleted: true }] } }, token);
  check(del.status === 200 && del.body?.applied === 1, 'delete is accepted as a tombstone');
  const after = await call('GET', `/sync/pull?since=${v}`, undefined, token);
  check(after.body?.changes?.workouts?.[0]?.deleted === true, 'deleted workout comes back as deleted');
  check(after.body?.changes?.workout_sets?.[0]?.deleted === true, 'its sets are deleted with it (cascade)');

  console.log('Cleanup');
  const gone = await call('DELETE', '/auth/me', undefined, token);
  check(gone.status === 204, `DELETE /auth/me -> ${gone.status} (test account removed)`);
} catch (e) {
  fail(e instanceof TypeError ? `cannot connect to ${API} (${e.cause?.code ?? e.message}). Is the backend running?` : e.message);
}

console.log(failures ? `\n\x1b[31m${failures} check(s) failed: frontend and backend are NOT compatible.\x1b[0m\n` : '\n\x1b[32mAll checks passed: frontend and backend are compatible.\x1b[0m\n');
process.exit(failures ? 1 : 0);
