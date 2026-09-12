# P2 — API foundation, Grok vision, USDA nutrition, meals, gaps, meal plans

> Self-contained brief for one implementing agent. Read `AGENTS.md` first. Then read: `docs/ARCHITECTURE.md` §1–§3, §6–§7; `docs/DATA_MODEL.md` (all); `docs/API_CONTRACTS.md` §1, §2, §4, §7; `docs/INTEGRATIONS.md` §1.1, §2, §3, §5, §6; `docs/ALGORITHMS.md` §5, §6 (you implement these two; P3 implements §1–§4 and you call them).

## 0. Your ownership

You own `packages/shared/**` (create it, freeze it at C1), `apps/api/**` except: `routes/pets.ts`, `routes/weighins.ts`, `services/targets/**`, `services/scoring/**` (P3) and `routes/avatar.ts`, `routes/voice.ts`, `services/imagine/**`, `services/voice/**` (P4). You also own the monorepo root (`package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, CI if any), the seed script, and deployment.

## 1. Deliverables (MVP, in order)

1. Monorepo scaffold; `@petplate/shared` with `types.ts` (provided) + `constants.ts` (ALGORITHMS §7 values); builds to `dist/`.
2. Hono API: `config.ts`, pino logging, error handler, `/health`, Mongo connection, all models from DATA_MODEL.
3. Auth0 JWT middleware + `DEV_BYPASS_AUTH`.
4. `/me/bootstrap`, `/me/profile` (calls P3's `computeHumanTargets`; stub it if not merged yet), `/me/today` (reads `dailyScores`; calls P3's `recomputeDay` if the row is missing).
5. `services/photos.ts` + `GET /photos/:id`.
6. `services/grok/client.ts`, `vision.ts` with structured output and 8 s timeout.
7. `services/usda/fdc.ts` with cache in `foods`, nutrient ID map, scaling; `services/nutrition/enrich.ts`.
8. `POST /meals/analyze`, `POST /meals`, `GET /meals`, `DELETE /meals/:id`.
9. `DEMO_MODE` fixtures for analyze (3 rehearsed plates) and `seed:demo` script.
10. `GET /nutrition/gaps`, `POST /mealplans/generate` with the verify loop.
11. Deploy to Railway/Fly; share the URL.

Stretch: Atlas Search on `foods.description`; Nutritionix fallback; per-user rate limit (60 req/min) middleware; request-id logging.

## 2. Scaffold — exact steps

```bash
pnpm init; echo "packages:\n  - 'apps/*'\n  - 'packages/*'" > pnpm-workspace.yaml
mkdir -p packages/shared/src apps/api/src
# shared
cd packages/shared && pnpm init && pnpm add zod && pnpm add -D typescript tsup vitest
# package.json: "name":"@petplate/shared","main":"dist/index.js","types":"dist/index.d.ts","scripts":{"build":"tsup src/index.ts --dts --format esm,cjs","test":"vitest run"}
# src/index.ts: export * from './types'; export * from './constants';
# api
cd ../../apps/api && pnpm init && pnpm add hono @hono/node-server mongoose zod openai pino pino-pretty jose date-fns date-fns-tz sharp @petplate/shared@workspace:* && pnpm add -D typescript tsx vitest @types/node
# scripts: "dev":"tsx watch src/index.ts","build":"tsc -p tsconfig.json","start":"node dist/index.js","test":"vitest run","seed:demo":"tsx scripts/seedDemo.ts"
```
Root `package.json` scripts: `"typecheck": "pnpm -r exec tsc --noEmit"`, `"test": "pnpm -r test"`, `"dev": "pnpm -r --parallel dev"`.

## 3. Core files

### `src/config.ts`
Parse `process.env` with a zod schema (every key in `.env.example`, with defaults where the example has them). Export `config`. Export `isDemo = config.DEMO_MODE`.

### `src/lib/errors.ts`
`class AppError extends Error { constructor(public code: ErrorCode, public status: number, message: string) }` + `app.onError` that maps `AppError` → `{ error: { code, message } }`, `ZodError` → 400 `VALIDATION_ERROR` with the first issue path in the message, anything else → 500 `INTERNAL` (log stack).

### `src/lib/auth.ts`
Per INTEGRATIONS §3. Middleware signature: `authMiddleware: MiddlewareHandler<{ Variables: { userId: string; auth0Sub: string; user: UserDoc } }>`. Lazily creates the user with `email`/`name` from the token if present (Auth0 puts them in the ID token, not the access token, so on bootstrap the app sends `name`; email may be absent — store `''` and let bootstrap fill it).

### `src/lib/day.ts`
```ts
export const dayKey = (d: Date, tz: string) => formatInTimeZone(d, tz, 'yyyy-MM-dd');
export const dayRange = (key: string, tz: string): { start: Date; end: Date } // [00:00, 24:00) in tz, converted to UTC
export const localHour = (d: Date, tz: string) => Number(formatInTimeZone(d, tz, 'H'));
```
Unit-test with `America/Vancouver` and `Asia/Tokyo` around midnight.

### `src/lib/http.ts`
`fetchWithTimeout(url, init, ms)` using `AbortController`; throws `AppError('UPSTREAM_TIMEOUT', 504, ...)` on abort.

### `src/db/models/*`
One file per collection in DATA_MODEL, Mongoose schemas with `timestamps: true`, the listed indexes, and a `toApi()` helper per model that maps `_id → id`, `Date → ISO`, and `photoId → photoUrl: '/api/photos/<id>'` where relevant. Never leak `data` Buffers from `photos` in `toApi`.

## 4. Vision — `services/grok/vision.ts`

```ts
export async function analyzeMealPhoto(jpeg: Buffer, hint?: string): Promise<{ result: VisionResult; model: string; latencyMs: number; fallback: boolean }>
```
- Build the request per INTEGRATIONS §1.1. `messages: [{ role:'system', content: SYSTEM }, { role:'user', content: [{ type:'text', text: hint ? `Meal hint: ${hint}` : 'Analyze this meal.' }, { type:'image_url', image_url: { url: dataUrl, detail:'high' } }] }]`.
- `response_format` json_schema (strict). Parse `choices[0].message.content` with `VisionResultSchema`. On zod failure: one retry with an appended user message `"Your previous output was invalid JSON for the schema: <issue>. Output valid JSON only."`.
- On timeout or error: if `isDemo` → `return { result: canned(jpeg), fallback: true, ... }` else throw.
- `canned(jpeg)`: `services/demo/canned.ts` exports 3 fixtures (`chicken_rice_broccoli`, `oatmeal_berries`, `salmon_salad`) as `VisionResult`. Pick by comparing the average luminance of the image to fixture metadata if you have time; otherwise return the first. Document which plate the demo team must photograph.

## 5. USDA — `services/usda/`

`nutrientIds.ts`: the table from INTEGRATIONS §2 as `Record<keyof Nutrients, number>` (omit none; every key in `NutrientsSchema` must be present).

`fdc.ts`:
```ts
export async function lookupFood(query: string): Promise<{ fdcId: number; description: string; per100g: Nutrients; dataType: string } | null>
export function scaleNutrients(per100g: Nutrients, grams: number): Nutrients
```
- Normalize `queryKey`; check `foods` cache; on miss call search (4 s timeout); pick per §2 rules; build `per100g` by iterating `foodNutrients` and matching `nutrient.id` (or `nutrientId` — VERIFY field name on the first real response and handle both); missing nutrients → 0; write cache; return.
- Rate-limit guard: keep an in-memory counter per hour; if > 900, skip USDA and return null (log a warning).

`services/nutrition/enrich.ts`:
```ts
export async function enrichItems(items: { name: string; grams: number; usdaQuery?: string; fdcId?: number | null; estimatedKcal?: number; confidence?: number }[]): Promise<MealItem[]>
export function sumNutrients(list: Nutrients[]): Nutrients
```
- If `fdcId` given → fetch by id (`GET /fdc/v1/food/{fdcId}` — cache it too). Else `lookupFood(usdaQuery ?? name)`. If null and `NUTRITIONIX_APP_ID` set → Nutritionix fallback. If still null → `matchSource: 'grok_estimate'`, nutrients = `{ ...emptyNutrients(), kcal: estimatedKcal ?? 0 }`.
- Run in parallel with `Promise.allSettled`; a rejected lookup degrades to `grok_estimate`, never fails the request.

## 6. Meals routes — `routes/meals.ts`

- `POST /meals/analyze`: parse multipart (`await c.req.parseBody()`), read `photo` as `File` → `Buffer`; `sharp` → resize ≤ 1024, JPEG q80, enforce ≤ 300 KB (reduce quality until under); store via `photos.store(userId, 'meal', buf)`; `analyzeMealPhoto`; `enrichItems(result.items)`; respond `MealDraftSchema`.
- `POST /meals`: validate `MealCreateSchema`; slot default from `localHour`: <10 breakfast, <15 lunch, <21 dinner, else snack; `enrichItems(body.items)`; `totals = sumNutrients`; `dayKey`; save; `const { celebrate } = await recomputeDay(userId, dayKey)` (import from `services/scoring` — P3; until merged, a stub that upserts a zero row); respond `{ meal, today: await buildToday(userId) }`.
- `buildToday(userId)` lives in `routes/me.ts` helpers (`services/today.ts`): assembles `TodaySummary` from `users`, `pets`, `dailyScores`, and `adjustments` (last 3 entries from `pets.targets.adjustmentLog` / `users.targets.adjustmentLog` — P3 writes these; read defensively). `avatar.*Url` = `/api/photos/<id>` or null.
- `GET /meals?date=` → meals for that dayKey sorted by `loggedAt`.
- `DELETE /meals/:id` → 404 if not owner; delete; `recomputeDay`; 204.

## 7. Gaps and meal plan

`services/nutrition/gaps.ts` per ALGORITHMS §5 → `GET /nutrition/gaps`.

`services/mealplan/generate.ts` per ALGORITHMS §6:
- Prompt (system): `"You are a registered-dietitian-style meal planner. Propose exactly 3 meals (breakfast, lunch, dinner) for one day. Total calories must be within 10% of TARGET_KCAL. Prioritize whole foods rich in the listed GAP nutrients. Respect PREFS and never include ALLERGIES. Each meal: a title and 3–7 ingredient lines with grams and a usdaQuery (2–4 words matching USDA Foundation/SR Legacy names). Output JSON only."` User message: JSON with `targetKcal`, `proteinTargetG`, `gaps` (nutrient, pctOfTarget, label), `prefs`, `allergies`, optional `feedback`.
- Structured output `MealPlanProposalSchema`; `GROK_CHAT_MODEL`; 20 s timeout.
- Enrich every ingredient line; compute per-meal and day totals; verify; retry once with feedback strings like `"Day total 2620 kcal exceeds 2100 ±10%"`, `"fiberG only 22 g of 38 g target"`.
- Save `mealPlans`; respond `MealPlanSchema`. Cache: if a plan for `forDayKey` exists and `verified`, return it unless `?force=1`.

## 8. Demo seed — `scripts/seedDemo.ts`
Per DATA_MODEL §10. Use P3's `computeHumanTargets`, `computePetTargets`, and `recomputeDay` for every seeded day so numbers are consistent (do not hand-write scores). Idempotent: delete the demo user's data first. Print the demo email and the `x-dev-user` header hint.

## 9. Deploy
Railway: new project from repo, root `apps/api`, build `pnpm install && pnpm --filter @petplate/shared build && pnpm --filter api build`, start `pnpm --filter api start`. Set env. Verify `/api/health` and one authenticated call with a real Auth0 token (`curl -H "Authorization: Bearer ..." .../api/me/bootstrap`).

## 10. Acceptance checks
- [ ] `pnpm test` green: `day.ts`, `scaleNutrients`, `sumNutrients`, `gaps`, `enrichItems` (mock fetch).
- [ ] `POST /meals/analyze` with a real photo returns ≥ 1 USDA-matched item in < 6 s on a normal connection.
- [ ] Same call with network blocked and `DEMO_MODE=true` returns the fixture in < 100 ms with `fallback: true`.
- [ ] `POST /meals` → `today.human.consumed.kcal` increases by the meal's kcal; `combined` and `avatarState` change.
- [ ] `/mealplans/generate` returns `verified: true` for the demo user at least 2 of 3 runs.
- [ ] Unauthenticated request → 401 envelope; wrong owner → 404.
- [ ] Deployed URL passes the above.

## 11. Requests to other owners / Implementation notes

### Implementation notes (P2)

Built: pnpm monorepo, `@petplate/shared` (existing `types.ts` + `constants.ts` from ALGORITHMS §7), Hono API with config/pino/`AppError`, Auth0 JWT + `DEV_BYPASS_AUTH`/`x-dev-user`, all DATA_MODEL models, `/me/bootstrap|profile|today`, photos, Grok vision (8s, canned fallback), USDA FDC cache + scale, Nutritionix optional fallback, meals analyze/CRUD, gaps, meal-plan generate+verify (one retry), `seed:demo`, vitest for `day` / `scaleNutrients` / `sumNutrients` / `gaps` / `enrichItems`. Stretch: 60 req/min rate limit, `x-request-id`. Atlas Search not done.

**Demo plate:** photograph grilled chicken breast + brown rice + steamed broccoli on a ~27 cm plate. `DEMO_MODE=true` returns `chicken_rice_broccoli` if Grok times out.

**Run:** `pnpm install && pnpm --filter @petplate/shared build && pnpm --filter api dev`. Auth: `DEV_BYPASS_AUTH=true` and `x-dev-user: demo@petplate.app`. Seed: `pnpm --filter api seed:demo`.

**Deploy (config only, not live):** root `Dockerfile`, `railway.json`, `fly.toml`. Build `pnpm install && pnpm --filter @petplate/shared build && pnpm --filter api build`. Start `pnpm --filter api start`. Health: `/api/health`.

**Stubs P3 must replace:** `services/targets/human.ts`, `services/targets/pet.ts`, `services/scoring/*`. Current copies implement ALGORITHMS enough for `/me/profile`, meal scores, and seed. `recomputeDay` is called from meal writes and from `GET /me/today` when the row is missing (P2 task). P3 `/pets` should import `buildToday` from `services/today.ts`.

### Requests to other owners

- **P3:** Replace scoring/targets stubs; keep `recomputeDay(userId, dayKey)` and `computeHumanTargets` / `computePetTargets` signatures. After merge, re-run `seed:demo` so streak/combined match ALGORITHMS. Mount `/pets`, `/weighins`, `/scores`.
- **P4:** Mount `/avatar` and `/voice`. `buildToday` already maps `pets.avatar.*PhotoId` → `/api/photos/<id>`.
- **P1:** API base `/api`. Analyze is multipart field `photo` plus optional `hint`. Unauthenticated → `{ error: { code, message } }`.

