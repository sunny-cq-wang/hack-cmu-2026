# ARCHITECTURE

## 1. Runtime topology

```
+----------------------+   HTTPS (Bearer JWT)   +-------------------------+
|  Expo / RN app       | ---------------------> |  Hono API (Node 20)     |
|  Auth0 Universal     | <--------------------- |  /api/*                 |
|  Login               |                        |  verifies JWT via JWKS  |
+----------------------+                        +-----------+-------------+
                                                            | Mongoose
                                                            v
                                                +-------------------------+
                                                | MongoDB Atlas           |
                                                | users pets meals        |
                                                | feedings weighIns       |
                                                | dailyScores photos      |
                                                | mealPlans foods(cache)  |
                                                +-------------------------+

External services (called ONLY from the API):
+------------+ +---------------+ +--------------+ +-----------+ +------------+
| xAI chat   | | xAI Imagine   | | xAI Voice    | | USDA FDC  | | Auth0 JWKS |
| vision +   | | image edit,   | | STT, TTS,    | | nutrient  | |            |
| tools      | | img->video    | | realtime*    | | lookup    | |            |
+------------+ +---------------+ +--------------+ +-----------+ +------------+
* realtime is stretch
```

The mobile app talks **only** to our API. No third-party key ever ships in the app bundle except the Auth0 client ID (public by design).

## 2. Monorepo tooling

- **pnpm workspaces** (`pnpm-workspace.yaml`: `apps/*`, `packages/*`).
- Root scripts: `dev`, `typecheck`, `test`, `lint`.
- **TypeScript 5.x**, `"strict": true`, `"moduleResolution": "bundler"`.
- **vitest** for unit tests in `apps/api` and `packages/shared`.
- **eslint + prettier** with the default configs; do not spend time customizing.

## 3. `apps/api` structure

```
apps/api/
  src/
    index.ts            boots Hono, mounts routes under /api, connects Mongo
    config.ts           ONLY place that reads process.env; exports typed `config`
    lib/
      log.ts            pino logger
      auth.ts           Auth0 JWT middleware → sets c.var.userId, c.var.auth0Sub
      errors.ts         AppError(code, status, message) + error handler
      day.ts            dayKey(date, tz) → 'YYYY-MM-DD'; dayRange(dayKey, tz)
      http.ts           fetchWithTimeout(url, init, ms)
    db/
      connect.ts
      models/           one Mongoose model per collection (see DATA_MODEL.md)
    routes/
      me.ts             /me/bootstrap, /me/profile, /me/today
      meals.ts          /meals/analyze, /meals, /meals?date=
      pets.ts           (P3)
      weighins.ts       (P3)
      nutrition.ts      /nutrition/gaps
      mealplans.ts      /mealplans/generate
      avatar.ts         (P4)
      voice.ts          (P4)
      scores.ts         /scores
    services/
      grok/             client.ts (OpenAI SDK w/ baseURL), vision.ts, chat.ts
      usda/             fdc.ts (search + nutrient scaling), nutrientIds.ts
      nutrition/        enrich.ts (items → nutrients), gaps.ts
      mealplan/         generate.ts
      targets/          (P3) human.ts, pet.ts, adaptive.ts
      scoring/          (P3) score.ts, streak.ts, avatarState.ts
      imagine/          (P4) images.ts, video.ts, pipeline.ts
      voice/            (P4) stt.ts, tts.ts, agent.ts, tools.ts
      photos.ts         store/fetch JPEG buffers
      demo/             canned.ts — fixtures used when DEMO_MODE=true
  test/                 vitest specs mirroring services/
```

## 4. `apps/mobile` structure (Expo Router)

```
apps/mobile/
  app/
    _layout.tsx          Auth0Provider, QueryClientProvider, theme
    index.tsx            redirects → (auth)/login or (tabs)/home
    (auth)/login.tsx
    onboarding/
      profile.tsx        human profile form
      pet.tsx            pet form + photo (or virtual pet prompt)
      avatar.tsx         "generating your avatar" progress screen (P4 component inside)
    (tabs)/
      _layout.tsx        Home · Log · Pet · Plan
      home.tsx           dashboard: avatar, score ring, streak, today totals
      log.tsx            camera → analyze → confirm
      pet.tsx            (P3) portion, feedings, weigh-in, weight chart
      plan.tsx           gaps + tomorrow's plan
  src/
    lib/
      config.ts          reads EXPO_PUBLIC_* vars
      api.ts             typed fetch client; attaches Auth0 access token; parses with zod
      auth.ts            useAuth() hook around react-native-auth0
      queries.ts         react-query hooks: useToday(), useMeals(), usePet() ...
    features/
      home/              ScoreRing, StreakBadge, TodayTotals
      meals/             CameraCapture, AnalyzeSheet, ItemEditor, MealList
      pet/               (P3) PortionCard, FeedButton, WeighInSheet, WeightChart
      avatar/            (P4) PetAvatar (Rive), AvatarGenerator, CelebrationVideo
      voice/             (P4) TalkButton, VoiceSheet
      plan/              GapList, PlanCard
    components/ui/       Button, Card, Sheet, TextField, Skeleton
  assets/rive/pet.riv    (P4)
```

### Dev build — required, not optional

```bash
cd apps/mobile
npx expo prebuild                 # generates ios/ android/
npx expo run:android              # or run:ios (needs Xcode)
# OR: eas build --profile development --platform android
```

Config plugins needed in `app.json`: `react-native-auth0` (with `domain`), `expo-camera`, `expo-audio`, `expo-image-picker`. Rive needs no plugin but does need the native build.

## 5. Environment variables

See `.env.example` at the repo root. API reads them in `config.ts`; mobile reads `EXPO_PUBLIC_*` only.

## 6. Data flow for the core loop (reference for every owner)

1. App captures photo → resizes to max 1024 px, JPEG q=0.8 (`expo-image-manipulator`) → `POST /api/meals/analyze` (multipart).
2. API: store photo → Grok vision → items with grams → USDA enrich → return **draft** (not saved).
3. App shows draft; user edits grams / removes items → `POST /api/meals` with the final items.
4. API: recompute nutrients for edited items → save meal → **recompute today's `dailyScores` row** (P3's `scoring.recomputeDay(userId, dayKey)`) → return meal + today summary.
5. App invalidates `useToday()` → home screen re-renders → `PetAvatar` receives new `avatarState` → Rive `happiness` input animates.

Same shape for feedings and weigh-ins: write → `recomputeDay` → `/me/today` reflects it.

## 7. Demo mode

`DEMO_MODE=true` in the API:
- `/meals/analyze` returns fixtures from `services/demo/canned.ts` keyed by a perceptual hash of the image (or simply the first fixture if hashing isn't done) **after** attempting the real Grok call with an 8 s timeout. Real result wins if it arrives.
- Avatar generation returns the pre-generated demo pet assets instantly.
- Voice returns real STT/TTS if reachable, otherwise a canned reply.
- Seed script `pnpm --filter api seed:demo` creates the demo user, pet, 14 days of meals, feedings, weigh-ins, and scores so charts and streaks look alive.
