# P1 — Mobile Core (Expo app shell, Auth0, meal logging, home, plan)

> Self-contained brief for one implementing agent. Read `AGENTS.md` first. Then read: `docs/ARCHITECTURE.md` §4–§6, `docs/API_CONTRACTS.md` §1, §2, §4, §7, `docs/INTEGRATIONS.md` §3 (Auth0). Skim `docs/DATA_MODEL.md` §3. You do not need ALGORITHMS.md — the server does all math.

## 0. Your ownership

You own: `apps/mobile/app/**` (all routes), `apps/mobile/src/lib/**`, `apps/mobile/src/features/meals/**`, `apps/mobile/src/features/home/**`, `apps/mobile/src/features/plan/**`, `apps/mobile/src/components/ui/**`, `apps/mobile/app.json`, `apps/mobile/package.json`.

You do NOT implement `features/pet` (P3), `features/avatar` or `features/voice` (P4). You **mount** their exported components in your routes using the interfaces in §6. Until they exist, render the placeholders described there.

## 1. Deliverables (MVP, in order)

1. Expo app with a working **dev build** on Android (and iOS if a Mac is available).
2. Auth0 login/logout; access token attached to every API call; `POST /me/bootstrap` on first login.
3. Onboarding: profile form → `PUT /me/profile`; pet form (delegates to P3 component) → `POST /pets`; avatar screen (mounts P4 component).
4. Home tab: avatar area (P4 component), score ring, streak badge, today's totals, adjustments toast.
5. Log tab: camera → `POST /meals/analyze` → editable draft → `POST /meals` → back to Home with fresh data.
6. Meal list for today with delete.
7. Plan tab: gaps list (`GET /nutrition/gaps`) and "Generate tomorrow's plan" (`POST /mealplans/generate`).
8. Loading, error, and empty states for every screen. Disclaimers footer.

Stretch: haptics on score change; pull-to-refresh; 7‑day score chart on Home (`GET /scores`, Victory Native); dark mode.

## 2. Setup steps

```bash
cd apps/mobile
npx create-expo-app@latest . --template tabs   # or blank-typescript then add expo-router
pnpm add react-native-auth0 @tanstack/react-query zod expo-camera expo-image-manipulator expo-image-picker expo-haptics expo-secure-store react-native-reanimated react-native-gesture-handler victory-native @shopify/react-native-skia expo-audio rive-react-native
pnpm add -D typescript @types/react
```
`app.json` plugins (add exactly):
```json
"plugins": [
  "expo-router",
  ["react-native-auth0", { "domain": "<from EXPO_PUBLIC_AUTH0_DOMAIN>" }],
  ["expo-camera", { "cameraPermission": "PetPlate uses the camera to log meals." }],
  ["expo-image-picker", { "photosPermission": "PetPlate uses your photos for meals and your pet's avatar." }],
  ["expo-audio", { "microphonePermission": "PetPlate uses the microphone so you can talk to your pet." }]
],
"scheme": "petplate"
```
Then `npx expo prebuild && npx expo run:android`. Commit `ios/` and `android/`? **No** — add to `.gitignore`; everyone prebuilds locally.

Auth0 dashboard: add callback/logout URLs `petplate://<domain>/android/<applicationId>/callback` and `petplate://<domain>/ios/<bundleId>/callback` (exact format in react-native-auth0 README).

## 3. `src/lib` — build these first

### `config.ts`
```ts
export const config = {
  apiBase: process.env.EXPO_PUBLIC_API_BASE!,
  auth0Domain: process.env.EXPO_PUBLIC_AUTH0_DOMAIN!,
  auth0ClientId: process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID!,
  auth0Audience: process.env.EXPO_PUBLIC_AUTH0_AUDIENCE!,
};
```
Throw at startup if any is missing.

### `auth.ts`
Wrap `react-native-auth0`'s `useAuth0()`:
- `signIn()` → `authorize({ audience, scope: 'openid profile email offline_access' })`, then `POST /me/bootstrap` with device timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) and `user.name`.
- `getAccessToken()` → `getCredentials()` (auto-refresh) → `.accessToken`.
- `signOut()` → `clearSession()` + `clearCredentials()` + clear react-query cache.

### `api.ts`
```ts
export async function api<T>(path: string, init: RequestInit & { schema: z.ZodType<T>; multipart?: boolean }): Promise<T>
```
- Prefix `config.apiBase + '/api'`; add `Authorization: Bearer`.
- On non‑2xx, parse `ApiErrorSchema`, throw `ApiError(code, message, status)`.
- On 2xx, `schema.parse(await res.json())`. Log zod failures with the path — they mean a contract drift; do not "fix" by loosening the schema.
- 20 s timeout via `AbortController`.

### `queries.ts` (react-query)
| hook | call | staleTime |
|---|---|---|
| `useMe()` | `POST /me/bootstrap` (idempotent) | ∞ |
| `useToday()` | `GET /me/today` | 0 |
| `useMeals(dayKey)` | `GET /meals?date=` | 0 |
| `useGaps()` | `GET /nutrition/gaps?days=7` | 5 min |
| `useAnalyzeMeal()` | mutation → `POST /meals/analyze` multipart | |
| `useCreateMeal()` | mutation → `POST /meals`; on success `setQueryData(['today'], res.today)` and invalidate `['meals']` | |
| `useDeleteMeal()` | mutation; invalidate `['today'],['meals']` | |
| `useGeneratePlan()` | mutation → `POST /mealplans/generate` | |
| `useUpdateProfile()` | mutation → `PUT /me/profile`; invalidate `['me']` | |

Rule: after any mutation that returns `today`, write it straight into the `['today']` cache so the avatar reacts instantly.

## 4. Screens

### `app/index.tsx`
If not authenticated → `/(auth)/login`. Else `useMe()`: if `!onboardingComplete` → `/onboarding/profile`; else `/(tabs)/home`.

### `(auth)/login.tsx`
Logo, one-line pitch, "Continue with Auth0" button → `signIn()`.

### `onboarding/profile.tsx`
Fields exactly matching `HumanProfileSchema`: sex (segmented), age, height (cm, with a ft/in toggle that converts), weight (kg, with lb toggle), activity (5 options with one-line descriptions), goal, target weight (only if lose/gain), dietary prefs (chips: vegetarian, vegan, pescatarian, halal, kosher, gluten-free), allergies (free text chips). Validate with the zod schema before submit. On success → `/onboarding/pet`.

### `onboarding/pet.tsx`
Render `<PetForm onSaved={() => router.push('/onboarding/avatar')} />` from `features/pet` (P3). Placeholder until it exists: a form with name/species/weight/idealWeight and a "Skip (virtual pet)" button that calls `POST /pets` with `{ name: 'Pixel', species: 'virtual', weightKg: 10, idealWeightKg: 10 }`.

### `onboarding/avatar.tsx`
Render `<AvatarGenerator onReady={() => router.replace('/(tabs)/home')} />` from `features/avatar` (P4). Placeholder: button "Continue" that navigates.

### `(tabs)/_layout.tsx`
Tabs: Home (house icon), Log (camera), Pet (paw), Plan (list). Icons from `lucide-react-native`.

### `(tabs)/home.tsx`
Layout top → bottom:
1. `<PetAvatar />` from `features/avatar` (P4), 220 px tall. Placeholder: a rounded square with the text of `today.mood`.
2. `<ScoreRing combined={today.combined} state={today.avatarState} />` — 120 px ring, number in the middle, label "Today".
3. `<StreakBadge length={today.streak.length} todayCounted={today.streak.todayCounted} />` — flame + number; "✓ today" when counted.
4. `<TodayTotals human={today.human} pet={today.pet} />` — two rows: "You — 1,420 / 2,100 kcal · 88 g protein" with progress bar; "Biscuit — 92 / 184 g · 1 of 2 meals" with progress bar. Tap the pet row → Pet tab.
5. `<AdjustmentToasts items={today.adjustments} />` — dismissible cards (session-local dismiss).
6. `<TalkButton />` floating bottom-right from `features/voice` (P4). Placeholder: none.
7. Footer text: "Not medical or veterinary advice."
`useToday()` with `refetchOnWindowFocus`. Show a skeleton on first load, an inline error with retry on failure.

### `(tabs)/log.tsx`
State machine: `idle → capturing → analyzing → reviewing → saving → done`.
- `CameraCapture`: `expo-camera` full-screen with shutter and a gallery button (`expo-image-picker`). After capture: `ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1024 } }], { compress: 0.8, format: JPEG })`.
- `analyzing`: show the photo dimmed with a progress label ("Reading your plate…"). Call `useAnalyzeMeal()`. If it fails with `UPSTREAM_TIMEOUT`, show "Couldn't analyze — add items manually" and go to `reviewing` with an empty draft.
- `AnalyzeSheet` (reviewing): list of `ItemRow` — name, grams stepper (±10 g, editable text), kcal (recomputed client-side ONLY for display as `nutrients.kcal * newGrams / originalGrams`; the server recomputes for real), confidence chip if < 0.6, swipe to delete. "Add item" opens a text field → adds `{ name, grams: 100, fdcId: null }`. Slot picker (breakfast/lunch/dinner/snack, default from hour). Totals footer. Micro chips: fiber, iron, potassium, vitamin C with the sum for this meal.
- Confirm → `useCreateMeal()` with `{ photoId, slot, items: items.map(({name, grams, fdcId}) => ({name, grams, fdcId})) }`. On success: haptic success, navigate to Home. The Home avatar will animate because `['today']` was updated.
- Below the camera on `idle`: `MealList` for today (`useMeals`) with thumbnails (`photoUrl`), totals, swipe to delete.

### `(tabs)/pet.tsx`
`export default` re-exports `PetScreen` from `features/pet` (P3). Placeholder: text "Pet screen coming from P3".

### `(tabs)/plan.tsx`
- `GapList` — from `useGaps()`: for each gap a card "Fiber — 37% of target" with a bar and the three `suggestFoods` as chips. Empty state: "No gaps this week. Nice."
- "Plan tomorrow" button → `useGeneratePlan()`; show a spinner with the label "Asking Grok, verifying with USDA…" (this call can take 10–25 s; set the api timeout to 40 s for this one).
- `PlanCard` per meal: title, ingredient lines with grams, kcal, and a "USDA‑verified" badge when `plan.verified`. Button "Log this meal" → `POST /meals` with `source: 'plan'`, `items` from ingredient lines (`fdcId: null`).

## 5. UI kit (`components/ui`)
Keep it minimal: `Button` (primary/secondary/ghost, loading state), `Card`, `Sheet` (bottom sheet using `@gorhom/bottom-sheet` or a simple Modal), `TextField`, `Segmented`, `Chip`, `ProgressBar`, `Skeleton`. Colors: background `#0F1115`, card `#1A1D24`, text `#F2F4F8`, accent by state: thriving `#3DDC97`, okay `#FFC857`, drooping `#FF6B6B`. Use these three state colors everywhere a state appears.

## 6. Interfaces you consume from other owners

```ts
// features/avatar (P4)
export function PetAvatar(props: { size?: number }): JSX.Element     // reads useToday() itself
export function AvatarGenerator(props: { onReady: () => void }): JSX.Element
// features/voice (P4)
export function TalkButton(): JSX.Element                              // floating; opens its own sheet
// features/pet (P3)
export function PetForm(props: { onSaved: (pet: Pet) => void; existing?: Pet }): JSX.Element
export function PetScreen(): JSX.Element
```
Import with `try/catch`-free static imports; if the module isn't there yet, create `index.ts` in that folder exporting the placeholder and mark it `// PLACEHOLDER — P3/P4 replaces this file`.

## 7. Acceptance checks

- [ ] Fresh install → login → onboarding → home in under 90 s on the dev build.
- [ ] Killing the app and reopening keeps the session (credentials manager).
- [ ] Log flow works with the real API and with `DEMO_MODE=true`.
- [ ] Editing grams then confirming shows updated totals from the server (not the client estimate).
- [ ] `['today']` updates without a refetch after confirm (watch network tab / logs).
- [ ] All zod parses pass against the running API (no contract drift warnings in logs).
- [ ] Every screen has loading, error (with retry), and empty states.
- [ ] `pnpm typecheck` clean.

## 8. Requests to other owners

**P1 → P2 (`packages/shared`).** The workspace had no `package.json` for the shared
package, so P1 created the wrapper around the existing `types.ts` — **`types.ts` itself
was not touched.** New files: `packages/shared/package.json` (`@petplate/shared`,
`main: ./src/index.ts` so Metro transpiles the source directly), `src/index.ts`
(`export * from './types'`), `tsconfig.json`, `tsconfig.build.json` (`pnpm --filter
@petplate/shared build` emits `dist/` for the API). zod is pinned to `^3.25.76` — do not
move to zod 4, `types.ts` relies on v3 behaviour for `z.string().datetime()` and the
single-argument `z.record()`.

**P1 → P2 (response envelopes).** `API_CONTRACTS.md` wraps most payloads
(`{ user }`, `{ meal, today }`, `{ meals }`, `{ pet }`, `{ feeding, today }`,
`{ plan }`, `{ days }`), but `@petplate/shared` only ships the inner schemas. P1
composes the envelopes in `apps/mobile/src/lib/contracts.ts` **from** the shared
schemas — no field is re-declared. Please lift that file into `@petplate/shared` when
you build the API so both sides validate the identical object, then P1 deletes it.

**P1 → P3 / P4 (placeholders).** `src/features/pet/index.tsx`,
`src/features/avatar/index.tsx` and `src/features/voice/index.tsx` are marked
`// PLACEHOLDER` and export exactly the §6 signatures. Delete them and drop your real
files in place; do not merge into them. Two notes: they are `.tsx` (they render JSX),
and `TalkButton` is typed `(): React.JSX.Element | null` because the placeholder
renders nothing as §4 requires.

**P1 → P2 (`GET /photos/:id`).** `Meal.photoUrl` is an API-relative path
(`/api/photos/:id`). `MealList` prefixes `config.apiBase` and hands it to
`expo-image`, which cannot attach `Authorization` or `x-dev-user`. Please either
issue short-lived signed URLs, serve a public-with-token query string, or document
how the mobile client is supposed to fetch authenticated image bytes. Until then,
thumbnails work in mock mode (null URLs → fallback icon) and will 401 against a
locked-down API.

**P1 → P2 (row types).** `@petplate/shared` exports the response envelopes'
*schemas* but not the row unions. P1 derives `Gap = GapsResponse['gaps'][number]`,
`PlannedMeal = MealPlan['meals'][number]`, and `HumanProfile['sex' | 'activity' |
'goal']` instead of retyping literals. Exporting those aliases from shared would
save the next owner the same dance.

## 9. Implementation notes

### Foundation phase — plan sections 1–6 plus the tab route shell

Delivered on branch `p1/mobile-core`. Home, Log, Plan and the Pet re-export landed in
later commits on this branch (`P1: home tab`, `P1: log tab`, `P1: plan and pet tabs`);
the notes below cover the screens plus close-out.

- **Toolchain.** pnpm 10.34.5 (`corepack enable pnpm` fails with EPERM on this
  machine — install with `npm i -g pnpm@10`), Expo SDK 57 (`expo ~57.0.22`,
  React Native 0.86.3, React 19.2.3), TypeScript ~6.0.3.
- **Workspace.** `nodeLinker: hoisted` in `pnpm-workspace.yaml`; React Native and
  Metro are far happier with a flat `node_modules`. `metro.config.js` still adds the
  workspace root to `watchFolders` and enables symlinks for `@petplate/shared`.
- **Env files.** Expo reads `.env` from the Expo project directory, not the monorepo
  root, so the `EXPO_PUBLIC_*` block is duplicated in `apps/mobile/.env.example`.
  Copy it to `apps/mobile/.env`. The root `.env.example` remains the master list.
- **Dev switches.** `EXPO_PUBLIC_MOCK_API=true` serves every route from
  `src/lib/mock` (seeded as a fully onboarded demo account with a pet, two meals and
  one feeding; call `resetMockStore(false)` to walk onboarding from scratch).
  `EXPO_PUBLIC_DEV_USER=<email>` skips Auth0 entirely and sends `x-dev-user`, which
  pairs with `DEV_BYPASS_AUTH=true` on the API.
- **Before `expo prebuild`:** put the real tenant into the `react-native-auth0`
  plugin `domain` in `app.json` (it currently reads `TENANT.us.auth0.com`), then add
  the callback/logout URLs to the Auth0 dashboard as described in §2.
- **Verification (foundation).** `pnpm typecheck` was clean and
  `npx expo export --platform android` bundled (3741 modules at that commit).

### Route map

| Route | File | What it does |
|---|---|---|
| `/` | `app/index.tsx` | Auth + onboarding gate. Loading spinner, error-with-retry, else `Redirect`. |
| `/(auth)/login` | `app/(auth)/login.tsx` | Logo, pitch, Auth0 (or "Continue (dev user)"). |
| `/onboarding/profile` | `app/onboarding/profile.tsx` | Full `HumanProfileSchema` with cm/ft·in and kg/lb toggles. |
| `/onboarding/pet` | `app/onboarding/pet.tsx` | Mounts P3 `<PetForm>`. |
| `/onboarding/avatar` | `app/onboarding/avatar.tsx` | Mounts P4 `<AvatarGenerator>`. |
| `/(tabs)/home` | `app/(tabs)/home.tsx` | Avatar, score ring, streak, totals, toasts, talk slot, disclaimer. |
| `/(tabs)/log` | `app/(tabs)/log.tsx` | Camera → analyze → review → save. Meal list when idle. |
| `/(tabs)/pet` | `app/(tabs)/pet.tsx` | Re-exports P3 `PetScreen`. |
| `/(tabs)/plan` | `app/(tabs)/plan.tsx` | Gaps + "Plan tomorrow" (40 s) + `PlanCard` "Log this meal". |

Root `app/_layout.tsx` mounts `Auth0Provider`, `QueryClientProvider`, gesture-handler
root, and wires React Query's focus manager to `AppState` so `useToday()` refetches
on resume. `app/(tabs)/_layout.tsx` is the four lucide tabs.

### Lib layer (close-out)

- **`api<S extends z.ZodTypeAny>`** is generic over the *schema*, not `z.ZodType<T>`.
  Shared schemas that use `.default()` have different input vs output types; a
  `ZodType<T>` bound inferred the wrong one. Callers pass `{ schema }` and get
  `z.infer<S>` back.
- **`src/lib/contracts.ts`** composes response envelopes (`{ user }`, `{ meal, today }`,
  `{ meals }`, `{ pet }`, `{ plan }`, `{ days }`, 204 `z.void()`) from shared schemas.
  No field is re-declared. Lift into `@petplate/shared` when the API is built (§8).
- **Timeouts.** Default 20 s (`DEFAULT_TIMEOUT_MS`). `useGeneratePlan` passes
  `timeoutMs: LONG_TIMEOUT_MS` (40 s). `AbortController` → `UPSTREAM_TIMEOUT`.
- **`process.env`** is read only in `src/lib/config.ts`. Everything else imports
  `config`. No `console.log` — `src/lib/log.ts` is the only console touch (`info` in
  `__DEV__`, `warn`/`error` always). No unlabelled `any`; the one RN FormData cast
  is `as unknown as Blob` with a `// why:` comment in `queries.ts`.

### How to run

Expo reads `.env` from `apps/mobile/`, not the monorepo root. Copy
`apps/mobile/.env.example` → `apps/mobile/.env` (keep values in sync with the root
`.env.example`, which stays the master list). Then:

```bash
pnpm install
pnpm typecheck
pnpm --filter mobile start   # do not use Expo Go — Auth0/Rive/audio need a dev build
# on a machine that can talk to a device:
#   npx expo prebuild && npx expo run:android
```

**`EXPO_PUBLIC_MOCK_API=true`** — `api()` dispatches to `src/lib/mock` (in-memory
store, every file marked `// MOCK ONLY`). Seeded as a fully onboarded demo account
with a pet, two meals and one feeding. `resetMockStore(false)` walks onboarding
from scratch. This is the mobile stand-in for the API's `DEMO_MODE=true`.

**`EXPO_PUBLIC_DEV_USER=<email>`** — skips Auth0, reports a synthetic session, sends
`x-dev-user`. Pair with `DEV_BYPASS_AUTH=true` on the API. Login button reads
"Continue (dev user)".

Flip either flag off and restart Metro with `--clear`.

### Stubs (delete, do not merge)

- `src/features/pet/index.tsx` — `PetForm` (name/species/weights + Skip → Pixel) and
  `PetScreen` ("Pet screen coming from P3").
- `src/features/avatar/index.tsx` — `PetAvatar` (rounded square of `today.mood`) and
  `AvatarGenerator` (Continue).
- `src/features/voice/index.tsx` — `TalkButton` returns `null`.
- `src/lib/mock/**` — local only; never ship as the real nutrition engine.

### Auth0 / prebuild (human)

`app.json` `react-native-auth0` plugin `domain` is still the placeholder
`TENANT.us.auth0.com`. Put the real tenant in there **before** `npx expo prebuild`,
and add the callback/logout URLs from §2 to the Auth0 dashboard. The runtime
`Auth0Provider` already reads `config.auth0Domain` from env; the plugin value is
what native code is generated with.

No `ios/` or `android/` in git — everyone prebuilds locally. Expo Go cannot run
this app.

### Photo URL auth (open question for P2)

See §8. `GET /photos/:id` is auth-required (`API_CONTRACTS.md` §7 /
`DATA_MODEL.md`). `expo-image` will request `photoUrl` without a bearer token.
Mock meals use `photoUrl: null` so the fallback icon shows.

### Shared row types / SwipeToDelete / RN 0.86 gotcha

- Shared does not export gap / planned-meal / profile-union aliases; P1 derives
  them (see §8).
- `SwipeToDelete` lives in `features/meals/` (PanResponder + classic `Animated`,
  no worklets). Promote to `components/ui` when a second feature needs it.
- React Native 0.86: do **not** spread `StyleSheet.absoluteFillObject` into a
  `StyleSheet.create` style — under the New Architecture the object is not
  assignable to `ViewStyle` in strict mode (position / inset types). Use
  `StyleSheet.absoluteFill` as a style value (Log backdrop, camera preview) or
  write `position: 'absolute', top/left/right/bottom: 0` (SwipeToDelete action
  layer, camera controls).

### Nutrition math

The only client kcal math is the labelled display estimate in
`features/meals/draft.ts` (`estimatedKcal` = `kcalAtSourceGrams * grams / sourceGrams`,
shown as "≈ N kcal"). Confirm sends `{ name, grams, fdcId }` only; Home/Plan/MealList
render server totals. Mock `nutrition.ts` / `store.ts` do scale-and-score so the
in-memory API can move numbers — that is quarantined behind `EXPO_PUBLIC_MOCK_API`.
Onboarding profile converts ft/in → cm and lb → kg; that is unit conversion, not
nutrition.

### Loading / error / empty (code audit)

Every P1-owned screen that fetches has a skeleton or spinner, an inline error with
retry, and an empty state where a list can be empty (meals, gaps, plan, analyze
items, human "No meals logged yet", "No pet yet"). Pet tab is a static P3
placeholder — no query of its own. Login/onboarding forms surface submit errors.
Device-only checks (session persist, live Auth0, real-API log flow, 90 s first-run)
are listed in the close-out report; they were not run here.

### Stretch

Not done: haptics on score change, 7-day Victory Native chart (`GET /scores`),
dark-mode toggle. Pull-to-refresh on Home (`RefreshControl` → `useToday().refetch()`)
is a follow-up commit on this branch.

### Close-out verification

- `pnpm typecheck` — clean (shared + mobile).
- `npx expo export --platform android` — bundled 3791 modules, wrote `apps/mobile/dist`
  (gitignored). Metro was not left running. No `expo prebuild` / `run:android`.
