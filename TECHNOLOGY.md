# GymTrack — Technology

Technical memory for AI assistants and developers: how the mobile app and the backend are built,
run, tested and shipped, plus the traps already hit. Read this before changing code.
Product rules and features are in [BUSINESS.md](BUSINESS.md).

_Last updated: 2026-11-25 · app v1.2.8 (versionCode 25)._

---

## 1. Big picture

```
Phone app (Expo / React Native)
        │  HTTPS + JSON, Bearer JWT
        ▼
Cloudflare Worker "gymtrack-backend"  ──►  one Durable Object "Api" (runs Express)
        https://gymtrack-backend.20912020100658.workers.dev        │
                                                                    ▼
                                         MongoDB Atlas (AWS sa-east-1, São Paulo), db "gymapp"
```

- **Cloud-only data.** All workouts, plans, exercises and settings live in MongoDB, reached only through
  the backend. The phone stores just the sign-in session (and, for old guest accounts, their device credentials).
- **Two git repos**, nested on disk:
  - `E:\GymApp` → `github.com/abdallaElnagar-74/GymTrack-FrontEnd` (mobile app)
  - `E:\GymApp\backend` → `github.com/abdallaElnagar-74/GymTrack-Backend` (API) — ignored by the app repo (`/backend/` in `.gitignore`).
- Branch `main` in both. Commit/push only when the user asks.

---

## 2. Mobile app (`E:\GymApp`)

### Stack
| | Version |
|---|---|
| Expo SDK | 58 (`expo ~58.0.26`) — **read the v58 docs, APIs change every SDK** (see `AGENTS.md`) |
| React Native | 0.88.1 (New Architecture) |
| React | 19.3 (React Compiler lint rules active) |
| Router | Expo Router 58 (file-based, `app/`), typed routes on |
| TypeScript | ~6.0 |
| Package manager | npm (`package-lock.json`); add packages with `npx expo install` |

Other libs: `expo-sqlite` (only its key-value store `expo-sqlite/kv-store` for the session; web uses `localStorage`),
`expo-file-system`, `expo-sharing`, `expo-document-picker` (backup export/import), `expo-video`, `expo-image-picker`,
`react-native-webview` (YouTube), `react-native-gifted-charts` (progress chart), `expo-linear-gradient`, `expo-symbols`.
No haptics module: vibration uses RN `Vibration` (Android `VIBRATE` permission is present).

### Layout
```
app/                      routes (Expo Router)
  _layout.tsx             SessionProvider > UnitProvider > Stack
  (tabs)/_layout.tsx      tabs: Workout · Plans · History · Exercises · Settings
  (tabs)/index.tsx        Workout tab: dashboard when idle, live workout when one is active
  (tabs)/plans.tsx        plans list + templates
  (tabs)/history.tsx      finished workouts
  (tabs)/exercises.tsx    exercise library (search, add)
  (tabs)/settings.tsx     account, kg/lb, rest timer, backup
  exercise/[id].tsx       exercise detail: videos, records, chart, history table
  routine/[id].tsx        plan editor: days, exercises, planned sets (PlanSetsEditor)
  train/[id].tsx          training screen for one exercise of the active workout (id = exercise id):
                          videos, set chips, current-set card (type, last time, weight/reps with −/+, Done);
                          Done → next set + rest; last set → router.replace to the next unfinished exercise
  workout/[id].tsx        finished-workout detail
src/api/                  backend access
  http.ts                 apiRequest(), URL resolution (EXPO_PUBLIC_API_URL; localhost→LAN/10.0.2.2 in dev)
  session.ts              session + guest-device storage, login/register/upgrade/merge, resumeGuest()
  SessionContext.tsx      boot flow, Api client (useApi), forces sign-in, connection-error UI
  legacy.ts, legacyWire.ts  one-time upload of the old on-phone SQLite DB (pre-cloud versions)
  storage.ts / storage.web.ts  kv store (native / web)
src/db/queries.ts         typed functions for every backend endpoint (+ types: Workout, WorkoutSet, PlannedSet…)
src/components/           RestTimer, PlanSetsEditor, ExercisePicker, ExerciseVideos, AccountForm, WorkoutTimer, Logo,
                          PrefToggles (language / appearance switches), ui.tsx
src/i18n/index.ts         t(), plural(), lang, isRTL, locale, setLanguage(), setMode(), syncDirection()
src/i18n/ar.ts            Arabic dictionary keyed by the English text
src/theme.ts              dark + light palettes; `mode` / `modeChoice` chosen at start-up; alpha() helper
src/prefStore.ts / .web.ts  synchronous device prefs (expo-sqlite/kv-store; localStorage on web)
src/hooks/useScreenData.tsx  per-tab loading/error/pull-to-refresh state
src/hooks/useRest.ts      shared rest countdown (module store + useSyncExternalStore) so it survives screen changes
src/utils/                format (kg/lb), feedback (haptic + reportError), confirm/notify, setKind, oneRepMax, youtube, videoFiles
src/UnitContext.tsx       account settings: unit + restSeconds (stored on the server)
```

### Configuration
- `EXPO_PUBLIC_API_URL` decides the server:
  - `.env.production` and `.env.development` → the Cloudflare Worker URL above.
  - For backend work, switch `.env.development` to `http://localhost:4000` (commented line in the file).
- Env vars are read when Metro starts: after changing them run `npx expo start --clear`.
- `app.json`: name "GymTrack" (renamed from "Gym Tracker" in 1.0.5; package id unchanged so updates install over old versions), package `com.gymtracker.app`, dark UI, portrait. Bump `expo.version` and
  `expo.android.versionCode` for every APK so it installs over the previous one.
- Icons: `assets/images/logo-source.png` is the original logo (white background). `node scripts/make-icons.js`
  recolours it and writes the app icon + adaptive icon + favicon (dark theme, bg #0a0b0f) and the transparent in-app
  logos `logo-on-dark.png` / `logo-on-light.png` (also used by the light/dark splash in `app.json`). Then prebuild with `--clean`.
- `android/` and `ios/` are generated (CNG, git-ignored). Never edit by hand; use `app.json` / config plugins
  (`plugins/withCmakeVersion`).

### Commands
```bash
npx expo start                 # dev server (Expo Go / dev build); add --clear after env or bundle issues
npx expo start --web           # web build (used for quick UI checks)
npx tsc --noEmit               # typecheck   — run before declaring work done
npx expo lint                  # lint        — run before declaring work done
```

### Building the APK (local, no EAS account used)
```bash
# 1. bump version + versionCode in app.json
npx expo prebuild --platform android --no-install     # sync android/ with app.json
cd android && NODE_ENV=production ./gradlew assembleRelease   # ~7-10 min
# output: android/app/build/outputs/apk/release/app-release.apk  → copied to E:\GymApp\GymTrack-<version>.apk
```
- Needs JDK 17 (`JAVA_HOME`) and the Android SDK (`ANDROID_HOME`); both are installed on the dev PC.
- Signed with the **debug keystore** (fine for sideloading; Google Play needs a real release key — EAS can manage one).
- APK ≈ 104 MB because it contains 4 ABIs (arm64-v8a, armeabi-v7a, x86, x86_64).
- Verify a build points at the right server:
  `unzip -p GymTrack-x.apk assets/index.android.bundle | grep -ao "https://gymtrack-backend[a-z0-9.-]*workers.dev"`.

### App patterns to keep
- **Every data call goes through `useApi()` + a function in `src/db/queries.ts`.** No local database.
- **Fewer round trips matter** (each request crosses to South America): run independent requests with `Promise.all`,
  and use the batch endpoints (`GET /workouts/:id/exercises?context=`note`, `link` (from the plan, '' if none), `done: 0|1` returns last session + records per exercise).
- `Button` (`ui.tsx`) accepts an async `onPress`: shows a spinner, blocks double taps, reports errors. Use it.
- Tabs use `useScreenData(load)` → `status` (`loading`/`ready`/`error`), `retry`, `refreshControl`.
- Workout tab while a workout is active (`(tabs)/index.tsx`): an overview list (`ExerciseRow`) with "Start training";
  no set editing there. `run()` shows an overlay for start/finish/discard; removing an exercise is optimistic.
- Training screen (`train/[id].tsx`): set edits are debounced (500 ms) and flushed before navigating; tick/kind changes
  are tracked in `inFlight`; it loads the active workout (`?context=`note`, `link` (from the plan, '' if none), `done: 0|1`), videos and `/exercises/:id/history`
  (first 3 = "Last 3 sessions") in parallel.
- Techniques: the account's list is `settings.techniques` (`useUnit()` → `techniques` / `setTechniques`, saved with
  `PUT /settings/techniques`), edited by `TechniquesEditor` in the Exercises tab. Built-ins `warmup` / `drop` always
  exist (name '' → translated by `techniqueName`). Exercises tick techniques in `exercises.technique_ids` (exercise
  screen). `TechniqueNote` shows "Note: this exercise includes …" from `exerciseTechniques(techniques, ids, sets)`
  (ticked + `drop` if any drop set) in the plan editor, workout list and training screen (`videos` → ▶ buttons).
  A set's video = `setVideo()` (built-in technique link, else the old `set.link`). Helpers in `src/utils/techniques.ts`.
  `PlanSetsEditor` has no link field. Backup keeps `technique_ids` (account settings aren't in backups).
- No autosave on typed edits (v1.2.7): `PlanSetsEditor` reports changes via `onChange`; the plan screen keeps drafts
  (`dayNames`, `draftSets`) and saves them together with the **Save** bar (or before **Start**). The exercise screen and
  `TechniquesEditor` work the same way. `useUnsavedGuard(dirty)` (`src/hooks`, wraps `usePreventRemove` from
  `expo-router`) asks "Discard changes?" when leaving with unsaved edits.
- Starting a plan day (Workout tab or plan editor) pushes `/train/<first exercise id>`; tapping an exercise card in the
  workout list opens `/train/<id>` too (exercise history is linked from there). The training screen uses the same
  debounced-edit / `inFlight` pattern as the workout list and flushes before navigating.
- Weight / reps boxes pass every change through `cleanNumber(text, decimals)` (`src/utils/number.ts`): Arabic/Persian
  digits → 0-9, `,` `٫` → `.`, everything else dropped. Use it for any new number input.
- **Mixed Arabic + numbers + units in one `Text` gets reordered by the bidi algorithm** (e.g. "آخر مرة: 20 20 kg × عدّات",
  header "6 / 2"). Lay such lines out as separate `Text`s in a row, or start a number-only string with `‎` (LRM).
  Two-column number tables (weight | reps) must use `textAlign: 'center'`, else in Arabic the columns align to
  opposite edges and run together ("kg 1040 عدّات").
- `POST /workouts/from-day` pre-fills each set's reps/weight from the last session. The training screen ignores them
  (boxes start empty; only used to spot bodyweight sets) and the workout list shows numbers only for ticked sets.
- Web QA without the Chrome extension: start Chrome with `--headless=new --remote-debugging-port=9333` and drive it
  over CDP (Node 22 has a global `WebSocket`). Prefs live in `localStorage` (`pref.lang`, `pref.mode`), the session
  in `gym.session`. Web Text uses `dir=auto`, so Latin names align left in Arabic on web only.
- New routes need the dev server to regenerate typed routes (`.expo/types/router.d.ts`) before `tsc` accepts them.
- Errors: `reportError(e)` (skips connection/5xx/401, which the session already reports).
- **Language & theme are fixed for the app's lifetime**: `src/theme.ts` and `src/i18n` read device prefs
  synchronously at module load (before any `StyleSheet.create`). Changing them saves the pref and calls
  `reloadAppAsync()` from `expo` (works in release builds). Arabic also calls `I18nManager.forceRTL`
  (`syncDirection()` in the root layout fixes a mismatch at start-up). Theme default = `Appearance.getColorScheme()`
  (`app.json` `userInterfaceStyle: "automatic"`).
- **All user-visible text goes through `t('English text', vars)`** (or `plural(n, one, other)`), and every key needs an
  entry in `src/i18n/ar.ts` (missing keys fall back to English). Translate muscle groups with `t(group)`;
  never translate exercise/plan names. Server error messages are passed through `t()` too.
- **Never hardcode colours**: use `theme.*` and `alpha(theme.x, a)`. Styles must not use `letterSpacing` in Arabic
  (it breaks letter joining): write `letterSpacing: isRTL ? 0 : `note`, `link` (from the plan, '' if none), `done: 0|1`. Arrows: use `<Arrow dir="forward|back" />` /
  `<Button arrow="back|forward">` from `ui.tsx` (an SVG chevron; never use ‹ › text: Android mirrors it in Arabic and
  `writingDirection` is iOS-only).
  Filled buttons/chips use `theme.fill` (neon lime in both modes) with `theme.onAccent` text; `theme.accent` is for
  text/icons; secondary buttons use `theme.secondary` + `theme.secondaryBorder`.

### Gotchas already hit (mobile)
- **Metro on this Windows PC sometimes serves a stale bundle** (file changes not picked up). If a change "doesn't show",
  kill the server and restart with `npx expo start --clear`.
- RN 0.88: `StyleSheet.absoluteFillObject` is gone (write `position:'absolute', top/left/right/bottom: 0`);
  the ScrollView ref type is `ScrollViewInstance` (`import { type ScrollViewInstance } from 'react-native'`).
- React Compiler lint (`react-hooks/purity`) flags `Date.now()` in component bodies even inside handlers →
  use small module-level helpers (`msFromNow`, `msSince` in `(tabs)/index.tsx`).
- Don't write refs during render (lint); update refs in effects.
- Exercise name field is `multiline` + `submitBehavior="blurAndSubmit"` so long names wrap instead of being cut off.
- **Never use `selectTextOnFocus` or a value-dependent style (e.g. smaller font when empty) on a TextInput**: on Android either
  one re-selects the text after the first character, so typing "12" gave "2". For an empty-state label, overlay a
  `Text` with `pointerEvents: 'none'` (see `Field` in `train/[id].tsx`) instead of styling the placeholder.
- No letter-avatar tiles for exercises (product rule; letter tiles are only for people/users, which the app doesn't have yet).

---

## 3. Backend (`E:\GymApp\backend`)

### Stack
Node 22+ / TypeScript 7 · Express 5 · MongoDB Node driver 7 · zod 4 · bcryptjs (cost 12) · jsonwebtoken (HS256, 60-day tokens)
· express-rate-limit 8 · helmet · cors. Deployed on **Cloudflare Workers** with wrangler 4 (pinned dev dependency).

### Files
```
src/app.ts        createApp(): helmet, cors, json (20mb), /health, /auth, /api, /sync, 404, error handler
src/auth.ts       register, login, guest, upgrade (guest→email), merge (guest→existing), me, delete me; requireAuth
src/data.ts       the data API (/api/...), batching helpers (exerciseContexts, routinesFull, workoutTotals), backup
src/db.ts         MongoClient (lazy), collections, indexes (ensureIndexes), tx()/snapshot() transactions
src/env.ts        env validation — lazy (on first use), so Workers deploys don't fail
src/worker.ts     Cloudflare entry: Worker → Durable Object "Api" → Express via handleAsNodeRequest
src/index.ts      Node entry (local dev / Docker): connect, migrate indexes, listen on PORT, print LAN IPs
src/sync.ts       legacy /sync/pull|push (only for uploading old on-phone data once)
src/tables.ts     zod schemas of all collections (sync format), cascades
src/seed.ts       starter exercises for new accounts
src/cloudflare.d.ts  minimal types for cloudflare:workers / cloudflare:node
test/api.test.ts, test/data.test.ts   integration tests (real MongoDB)
wrangler.jsonc    Worker config (name gymtrack-backend, DO binding API → class Api, nodejs_compat)
```

### Data model (MongoDB, one collection per type)
Every document: `user_id`, `id` (32-hex string made by the server), `updated_at` (ms), `deleted` (old sync tombstones;
ignored by the data API), `version`. Unique index `{user_id, id}`.

| Collection | Fields |
|---|---|
| `users` | `_id` (UUID), `email` (lower-case, unique), `password_hash`, `created_at`, `settings: { unit: 'kg'\|'lb', rest_seconds, techniques?: [{ id, name, link }], technique_links? }` (technique_links = v1.2.5 format, kept in sync for the built-ins) |
| `exercises` | `name` (unique per user, case-insensitive), `muscle_group`, `created_at`, `technique_ids?: string[]` (techniques it uses), `technique_links?` (v1.2.4, no longer used) |
| `exercise_videos` | `exercise_id`, `source: 'youtube'\|'file'`, `url`, `title`, `position` (file videos stay on the phone) |
| `routines` (plans) | `name`, `created_at` |
| `routine_days` | `routine_id`, `name`, `position` |
| `routine_day_exercises` | `day_id`, `exercise_id`, `position`, `target_sets`, **`sets: [{ kind, reps, weight_kg, note?, link? }]`** (planned sets; the app saves reps/weight 0 — entered while training; empty note/link is dropped; `link` must be a YouTube URL, checked by the server and the app) |
| `workouts` | `date` (start ms), `finished_at` (null = active), `title`, `notes`, `day_id` |
| `workout_sets` | `workout_id`, `exercise_id`, `set_number`, `reps`, `weight_kg` (always kg), `kind: normal\|warmup\|drop`, `note`, `link` (from the plan, '' if none), `done: 0\|1`, `created_at` |

Weights are stored in **kg**; the app converts for lb display. Warm-ups are excluded from volume and records.

### API (all `/api/*` need `Authorization: Bearer <token>`)
- `GET /health` → `{ ok: true }` (pings MongoDB)
- `/auth`: `POST register | login | guest | upgrade | merge`, `GET me`, `DELETE me` (deletes account + all data). Rate limit 30 / 15 min per IP.
- Exercises: `GET/POST /exercises`, `GET/PATCH/DELETE /exercises/:id`, `PUT /exercises/:id/techniques` (`{ ids }`), `PUT /exercises/:id/technique-links` (v1.2.4, unused), `GET /exercises/:id/records|history|last-session?exclude=`,
  `GET/POST /exercises/:id/videos`, `PATCH/DELETE /videos/:id`
- Workouts: `GET /workouts/active|summaries`, `GET /stats/dashboard?tz=<minutes>`, `POST /workouts`, `POST /workouts/from-day`,
  `GET/PATCH/DELETE /workouts/:id`, `GET /workouts/:id/exercises[?context=1]`, `GET /workouts/:id/undone-count`,
  `POST /workouts/:id/finish` (drops unticked sets, renumbers; `saved:false` if nothing ticked), `POST /workouts/:id/sets`,
  `DELETE /workouts/:id/exercises/:exerciseId`, `PATCH/DELETE /sets/:id`
- Settings: `GET /settings` → `{ unit, rest_seconds, techniques, technique_links }` (default 60), `PUT /settings` (partial), `PUT /settings/techniques` (`{ techniques }`, whole list; built-ins kept)
- Plans: `GET/POST /routines`, `POST /routines/from-template` (returns existing plan with the same name),
  `GET/PATCH/DELETE /routines/:id`, `POST /routines/:id/days`, `PATCH/DELETE /days/:id`,
  `POST /days/:id/exercises` (plan starts from last session's sets), `PUT /days/:id/order`,
  `PATCH /day-exercises/:id` (`{ sets }` or `{ target_sets }`), `DELETE /day-exercises/:id`
- Backup: `GET /backup`, `POST /backup` (replaces all data; accepts old numeric ids)

### Performance design (Atlas round trip ≈ 290 ms measured from the dev PC)
- Count **sequential** DB round trips per request and keep them low: `Promise.all`, `$lookup` joins, batch helpers.
- `requireAuth` caches "user exists" for 5 min (cleared on delete/merge).
- Node: pool `minPoolSize 5 / maxPoolSize 10`. Workers DO: `maxPoolSize 4, minPoolSize 0, maxIdleTimeMS 20s`.
- Durable Object pinned to South America (`LOCATION_HINT = 'sam'` in `worker.ts`) next to the Atlas cluster.

### Cloudflare Workers deployment
- Workers Builds deploys on every push to `main` of GymTrack-Backend: build `npm run build` (tsc), deploy `npx wrangler deploy`.
- Why a Durable Object: a plain Worker can't reuse a DB connection across requests; the DO keeps the MongoClient open.
- **Variables and Secrets (dashboard → Worker → Settings):** `MONGODB_URI`, `MONGODB_DB` (= `gymapp`), `JWT_SECRET` — keep all as **Secrets**.
  A plain dashboard *Variable* can be wiped by `wrangler deploy` (wrangler only keeps `vars` from `wrangler.jsonc`).
  `NODE_ENV=production` is set in `wrangler.jsonc`.
- Use the non-SRV `mongodb://host1,host2,host3/?tls=true&authSource=admin&replicaSet=...` URI (SRV lookups were not verified on Workers).
- Atlas Network Access must allow `0.0.0.0/0` (Cloudflare egress IPs vary).
- **Workers forbid at module load (global scope):** random values, timers, I/O. So: env and MongoClient are lazy,
  the bcrypt dummy hash is a precomputed constant, the rate limiter is created on the first request.
- Rate limiting uses `CF-Connecting-IP` on Workers only (spoofable elsewhere).
- Check a deploy: `curl https://gymtrack-backend.20912020100658.workers.dev/health`.
- `render.yaml` + `Dockerfile` + CircleCI (`.circleci/config.yml`: tests on mongo:8 replica set, then Render deploy hook)
  remain as an alternative Node deployment.

### Local development
```bash
cd backend
npm install
npm run dev          # tsx watch, port 4000 (reads .env)
npm run typecheck
MONGODB_DB=gymapp_test npm test      # integration tests — ALWAYS against gymapp_test, never the real "gymapp"
npx wrangler dev     # run the Worker locally in the real Workers runtime (secrets from .dev.vars, git-ignored)
npx wrangler deploy --dry-run --outdir <tmp>   # bundle check without uploading
```
- `.env` (git-ignored) holds `MONGODB_URI`, `MONGODB_DB`, `JWT_SECRET`, `PORT`. Never commit or paste its values.
- **This PC's network drops DNS TXT queries**, so `mongodb+srv://` fails locally (`queryTxt ETIMEOUT`). `.env` therefore uses the
  non-SRV form; the original SRV string is backed up in `.env.srv-backup.local` (git-ignored).
- Safe manual testing: run a second backend on another port against the test DB
  (`MONGODB_DB=gymapp_test PORT=4001 npx tsx --env-file=.env src/index.ts`) and point the web app at it
  (`EXPO_PUBLIC_API_URL=http://localhost:4001 npx expo start --web --port 8082 --clear`).

---

## 4. Security notes
- Passwords: bcrypt cost 12; unknown-email logins compare against a dummy hash (constant time).
- JWT secret ≥ 32 chars; tokens in the `Authorization` header only (no cookies) → CORS allows any origin.
- Every query is scoped by `user_id`; ids are validated (`[A-Za-z0-9_-]{1,64}`).
- Secrets live only in `backend/.env`, `backend/.dev.vars` and Cloudflare Secrets — all outside git.
- The Atlas DB password was once visible as a plain dashboard variable; rotating it in Atlas is recommended.

## 5. Open items / ideas
- Rest-timer alerts while the app is in the background need `expo-notifications` (+ new native build).
- Google Play release needs a real signing key (EAS credentials) and an AAB.
- Haptics are Android-only via `Vibration`; `expo-haptics` would need a native rebuild.
- Optional: arm64-only APK (~⅓ the size).
