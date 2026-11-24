# GymTrack — Business & Product

Product memory for AI assistants and developers: what the app is for, what it does, the rules behind each
feature, and what was decided. Keep these rules when changing features. Technical details are in
[TECHNOLOGY.md](TECHNOLOGY.md).

_Last updated: 2026-11-24 · current release v1.1.2._

---

## 1. What it is
A mobile gym logbook (Android APK; the same app also runs on iOS/web) for people who train with a plan.
You build training plans with every set worked out in advance, start a day with one tap, tick sets as you do them,
rest between sets with a timer, and see your history and personal records. All data is saved in the cloud
under your account, so it survives a lost phone and is the same on every device.

## 2. Users & accounts
- **An account is required.** The app opens on *Sign in / Create account*; there is **no guest mode**.
- Email + password (min 8 characters). Sign out from Settings; data stays in the account.
- **Migration from old versions** (no data may be lost):
  - A phone that used a guest account is asked to create an account → the guest becomes that account with all its data.
  - Or to sign in to an existing account → the guest's data is merged into it (exercises with the same name are merged).
  - Very old versions kept data in an on-phone database; it is uploaded once on first launch, then the same sign-in rule applies.
- Deleting an account deletes all of its data.
- Letter-avatar tiles are for **people/users only** — never in front of exercise names.

## 3. Features and rules

### Workout tab (home)
- **Idle:** each plan shows its **next day** (rotation: the day after the last one trained) with a big *Start* button,
  plus chips to start any other day; *Start empty workout*; progress tiles: workouts this week, week streak 🔥,
  total workouts, weight lifted this week; date of the last workout.
- **Active workout:** live timer, totals (exercises, sets done, volume), progress bar, and the **list of exercises**.
  - The list is for overview only — **no typing here**. Each exercise shows its sets as chips
    ("W · 10 kg × 15", "1 · 20 kg × 10", ✓ when done) and "x/y sets done"; ✕ removes it.
  - Big **▶ Start training** button (then "Continue: <exercise>") opens the training screen on the first exercise
    with sets left; tapping any exercise opens its training screen. All weights and reps are entered there.
  - When every set is done the list says so and *Finish workout* becomes the main button.
  - **Rest timer** starts after every ticked set and fills the whole screen (big countdown ring, Skip button at the bottom; tapping anywhere also goes to the next set): default **1 minute**, −15 / +15 seconds, **Skip rest**; under the countdown an "Up next" card names the next set (exercise, "Set 2 of 3 · Working set") or the next exercise (name, sets left, muscle group) or "Finish workout"; sizes adapt to the screen;
    vibrates when rest is over and closes 3 s later. Length is a setting (Off, 1:00, 1:30, 2:00, 3:00), saved to the account.
  - *Finish workout*: unticked sets are removed; if nothing was ticked the workout is discarded. Shows a summary
    (duration · exercises · sets · weight lifted).
  - *Discard workout* deletes it. Only one workout can be in progress.

### Training screen (one exercise at a time)
- **Starting a plan day opens straight on its first exercise** in a focused screen: the exercise's videos on top,
  then its sets as chips (W / 1 / 2 / D, ✓ when done) — tap any chip, or ‹ ›, to move between sets.
- The **current set card** shows: "Set 2 of 4", its type from the plan (tap to change), what you did last time,
  big weight and reps boxes with − / + (2.5 kg or 5 lb, 1 rep), and **✓ Done**.
- **Weight and reps always start at 0** (no hints; tapping a box selects the 0 so typing replaces it); Done asks for them until you enter them
  (weight may stay 0 only when the plan has no weight, e.g. bodyweight),
  so history only holds numbers you really entered. − / + count from 0.
- Done → next set + rest timer. The button says "Done · next set", or just "Done" on the last set of an exercise.
- **After the last set of an exercise it moves to the next exercise automatically**; after the last exercise it goes back
  to the workout list to tap *Finish workout*. The rest timer keeps running across these screens.
- Under the set card: **your last 3 sessions** of this exercise (fewer if you've done it fewer times, hidden if never),
  newest first — date, top weight, and every set as weight (kg) and reps.
- Also: + Add set, Previous / Next exercise, All exercises (the list), History & records.
- Tapping an exercise in the workout list opens this screen.

### Plans
- A plan = named list of **days** (e.g. Push / Pull / Legs); each day = ordered list of exercises.
- **Every set is planned in advance** (since v1.0.3): for each exercise in a day, a list of sets with
  **type** (working / warm-up / drop), **weight** and **reps**. Up to 20 sets per exercise.
  - A new exercise in a day starts as a copy of your last session of it (same types, weights, reps), or empty sets if never done.
  - An empty weight/reps box means "use what I did last time".
  - Changes save automatically; they are also saved before *Start*.
  - Starting the day creates the workout **exactly as planned**.
- Templates: *Arnold Split*, *Upper / Lower* (days only; you choose the exercises). Using a template you already have opens it.
- Deleting a plan or day keeps your workout history.

### History
- Finished workouts, newest first: date, title, exercises, sets, duration, total volume. Open one to see every set; delete it.

### Exercises
- Library grouped by muscle group (Chest, Back, Legs, Shoulders, Arms, Core, Other), searchable; new accounts get starter exercises.
- Names are unique per account (case-insensitive). Long names wrap (never cut off).
- **Exercise screen:** videos (YouTube links or a video file from the phone — the file stays on that phone),
  personal records (max weight, estimated 1RM, sessions), top-weight progress chart, and history as a table per session:
  **SET · WEIGHT (kg) · REPS** with units on every value.
- Deleting an exercise deletes its logged sets, plan entries and videos.

### Settings
Top to bottom: **Language** (English / العربية), **Appearance** (Auto / Dark / Light), weight unit **kg / lb**
(stored in kg, shown in your unit), rest timer length, backup export (JSON file) / import (replaces all data),
**Account** at the bottom (Sign out, with the email under it), then the logo and version.
- No "cloud / server" info is shown to the user.

### Language & appearance (since v1.1.0)
- **English and Arabic.** Default = the phone's language. Arabic switches the whole layout to right-to-left.
  Exercise and plan names are the user's own data and are not translated. kg / lb stay as is.
- **Light and dark mode.** Default (**Auto**) = the phone's dark/light setting; Dark or Light can be fixed in Settings.
- Language and appearance are saved **on the phone** (not in the account) and the app restarts to apply them.
- The **logo changes with the theme** (white/lime on dark, dark/green on light): sign-in screen and Settings.
  The splash screen follows the phone's mode. The home-screen icon stays dark (Android can't switch it).
- The sign-in screen has quick switches for language and light/dark at the top.

## 4. Definitions
- **Volume** = reps × weight, warm-ups excluded.
- **Estimated 1RM** = Epley: weight × (1 + reps / 30) (1 rep = the weight itself).
- **Personal records** come from finished workouts only, warm-ups excluded.
- **Week** starts Monday in the phone's time zone; **streak** = consecutive weeks with at least one workout.

## 5. UX principles (decided with the user)
- Every tap gives feedback: spinners on buttons, "Saving workout…" overlays, "Adding <exercise>…" placeholders, no double taps.
- Never show a misleading empty state while loading; show a retry screen if loading fails; pull to refresh everywhere.
- Weight and reps must always be clearly labelled (units on values; no bare `10×60`).
- Set things up before training; during training, as few taps as possible.

## 6. Releases
| Version | Date | Highlights |
|---|---|---|
| 1.0.0 | 2026-11-23 | First APK: offline-first app (on-phone DB) with sync |
| 1.0.1 | 2026-11-24 | Cloud-only data on the Cloudflare backend; much faster screens; loading/error states; rest timer; workout summary |
| 1.0.2 | 2026-11-24 | Account required (no guest); auto-advance to next exercise; rest default 1 min + Skip; clear kg/reps history |
| 1.0.3 | 2026-11-24 | Plan every set (type, weight, reps) before training; full exercise names; no letter tiles on exercises |
| 1.0.4 | 2026-11-24 | Training screen: workout opens on the first exercise, one set at a time, auto-moves to the next exercise |
| 1.0.5 | 2026-11-24 | Workout list is overview-only with "Start training"; training screen shows your last 3 sessions; GymTrack logo and name |
| 1.0.6 | 2026-11-24 | Full-screen rest timer after Done, with a big Skip button |
| 1.0.7 | 2026-11-24 | Tap anywhere on the rest timer to go to the next set |
| 1.0.8 | 2026-11-24 | Reps box always starts empty (plan shown as a hint); Done needs typed reps so history is accurate |
| 1.0.9 | 2026-11-24 | Weight box also starts empty (plan shown as a hint); Done needs the weight unless bodyweight |
| 1.0.10 | 2026-11-24 | No hints in the weight/reps boxes; logo recoloured for the dark theme (dark background, neon lime) |
| 1.0.11 | 2026-11-24 | Weight and reps boxes start at 0 |
| 1.0.12 | 2026-11-24 | Last set button just says "Done"; rest screen shows the next set/exercise under the timer; responsive rest screen |
| 1.1.0 | 2026-11-24 | Arabic + English (right-to-left), light / dark / auto mode, logo follows the theme, Settings reorganised (sign out at the bottom) |
| 1.1.1 | 2026-11-24 | Arrows point the right way in Arabic; clearer buttons in light mode (neon green with dark text, white secondary buttons with a border) |
| 1.1.2 | 2026-11-24 | Arrows drawn as vector icons: point outward (left) in Arabic, right in English |

APKs are built locally (`E:\GymApp\GymTrack-<version>.apk`) and installed by sideloading over the previous version.
Not on Google Play yet.

## 7. Ideas not done yet
- Rest-timer notification when the app is in the background.
- Google Play release (real signing key, AAB).
- Home-screen icon that follows light/dark mode.
