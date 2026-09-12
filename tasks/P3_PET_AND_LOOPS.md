# P3 — Pet vertical: targets, scoring, streak, adaptive loops, pet screens

> Self-contained brief for one implementing agent. Read `AGENTS.md` first. Then read **all of** `docs/ALGORITHMS.md` (you implement §1–§4 and §3.6), `docs/DATA_MODEL.md` §1, §2, §4, §5, §6, `docs/API_CONTRACTS.md` §3, §7, `docs/ARCHITECTURE.md` §3, §4, §6. Skim `docs/INTEGRATIONS.md` §3 only if the auth middleware confuses you.

## 0. Your ownership

API: `apps/api/src/services/targets/**`, `apps/api/src/services/scoring/**`, `apps/api/src/routes/pets.ts`, `apps/api/src/routes/weighins.ts`, `apps/api/src/routes/scores.ts`, and the matching `test/` specs.
Mobile: `apps/mobile/src/features/pet/**` (exports `PetForm` and `PetScreen`; see P1 §6 for the exact signatures P1 mounts).
`packages/shared/src/constants.ts` values are yours to populate (P2 owns the file's existence; coordinate before C1).

You depend on P2's scaffold (models, auth middleware, `buildToday`). Until it lands, develop the pure functions with vitest — they need no server.

## 1. Deliverables (MVP, in order)

1. `constants.ts` populated per ALGORITHMS §7.
2. `targets/human.ts`: `computeHumanTargets(profile, adaptiveOffsetKcal = 0): HumanTargets` + spec.
3. `targets/pet.ts`: `computePetTargets(pet: PetInput & { adaptivePct?: number }): PetTargets & { goal }` + spec (include the Biscuit worked example as a test).
4. `scoring/score.ts`: `humanScore`, `petScore`, `combinedScore`, `avatarStateFor`, `moodFor` + spec.
5. `scoring/streak.ts`: `streakLength(rows: DailyScore[], todayKey)` + spec.
6. `scoring/recomputeDay.ts`: `recomputeDay(userId, dayKey): Promise<{ score: DailyScore; celebrate: boolean }>` (needs models).
7. `targets/adaptive.ts`: `weeklyChangePct`, `adjustPet`, `adjustHuman`, `trend` + spec.
8. Routes: `POST/GET/PUT /pets/:id`, `POST/GET /pets/:id/feedings`, `POST/GET /weighins`, `GET /scores`.
9. Mobile `PetForm` and `PetScreen` (portion card, feed button, weigh-in sheet, weight chart, adjustment history, disclaimer).
10. Virtual-pet path (species `virtual`) end to end.

Stretch: multiple feedings per day with per-meal targets and "next meal due" countdown; 7‑day score bar chart component exported for P1's Home; "cat mode" copy and stricter bounds surfaced in UI.

## 2. Pure functions — write the tests first

### `targets/human.ts`
Test cases (assert to the integer):
- male, 25 y, 178 cm, 80 kg, moderate, lose → BMR 1780 (10·80 + 6.25·178 − 125 + 5 = 1792.5 → use exact math, assert 1792 or 1793 by your rounding rule; document the rule), TDEE = BMR×1.55, base = TDEE−500, kcal floor 1500.
- female, 40 y, 160 cm, 55 kg, sedentary, lose → floor 1200 applies.
- adaptive offset −400 clamps to −300; +500 clamps to +300.
- macros: proteinG = 1.6×kg; carbs never below 50.
- micros: male gets iron 8, female 18; age 55 female → calcium 1200, vitamin D 20.

### `targets/pet.ts`
- Biscuit: dog 14/12 kg neutered normal → goal lose, RER 451.5, factor 1.0, kcal 452, food 377/110 → portion 132, per meal 66.
- Same pet at 12.2 kg → maintain (12.2 ≤ 12.6), factor 1.6, kcal 722.
- Cat 6/4.5 kg → lose, factor 0.8, RER 70×4.5^0.75 = 216.7, kcal 217 (not below RER: 173 → floor is RER of ideal = 217? No: 216.7×0.8 = 173 < RER → floor applies → kcal = 217). Assert the floor.
- adaptivePct −20 on Biscuit → 452×0.8 = 361 < RER 451.5 → floor → 452. Assert.
- Virtual pet → dog math at 10 kg, maintain, factor 1.6 → kcal 630.

### `scoring/score.ts`
- 2100 target, consumed 2000, protein 130/130 → kcalScore 90.5 → ×0.9 = 81.4 + 10 → 91.
- consumed 0 → 0. consumed 3150 (150%) → 0 (+ protein bonus still applies? No: spec says if consumedKcal === 0 → 0; otherwise formula. 150% → kcalScore 0 → 0×0.9 + bonus ≤ 10 → ≤ 10. Assert ≤ 10.)
- pet: 132 target, fed 66 → 0 (pct 50 → 100 − 100 = 0); fed 132 → 100; fed 145 (110%) → 80.
- combined 81 & 100 → 91 → thriving. 81 & 0 → 41 → drooping.
- mood at 12:00 (expectedFrac (12−7)/14 = 0.357): consumed 750/2100 → paced 1.0 → 100; pet fed 66/132 → paced 1.4 → 20 → moodCombined 60 → okay.
- mood at 06:00 → expectedFrac clamps to 0.15.

### `scoring/streak.ts`
- rows for D‑4..D‑1 all counted, today counted → 5. D‑2 missing → 1 (only D‑1) + today → 2. Today not counted, D‑1..D‑3 counted → 3.

### `targets/adaptive.ts`
- `weeklyChangePct`: two points 14 days apart 14.0 → 13.7 → slope −0.0214 kg/day → −0.15/wk → −1.09%. One point → null. Two points 3 days apart → null.
- `adjustPet` dog lose, obs −0.3% → adaptivePct −5, message includes "reduced 5%". obs −2.5% → +10 and `vetFlag`. Cat obs −1.2% → +10 and `vetFlag`. `lastAdjustedAt` 3 days ago → no change, message "adjusted recently".
- `adjustHuman` lose, obs −0.1 kg/wk → offset −100. obs −1.2 → +100. Clamp at ±300.
- `trend.projectedGoalDate`: 13.7 kg, ideal 12, slope −0.15/wk → 11.3 weeks → date ≈ today + 79 days. Wrong sign → null.

## 3. `recomputeDay` — orchestration
Per ALGORITHMS §3.6. Implementation notes:
- Load user (tz, targets) and pet (targets). If no pet → `pet` section zeros, `petScore = 0`, `combined = humanScore` (policy for pet-less users; document it).
- `dayRange` from `lib/day.ts` (P2). Aggregate `meals.totals` and `feedings.grams/kcal` with Mongo `$match`+`$group`; don't load documents.
- `mood` uses `localHour(new Date(), tz)` only when `dayKey === todayKey`; otherwise `mood = avatarState`.
- Streak: query `dailyScores` for the last 60 days sorted desc; compute with `streakLength`.
- `celebrate = previous.streakCounted === false && next.streakCounted === true`.
- Upsert with `findOneAndUpdate({ userId, dayKey }, ..., { upsert: true, new: true })`.
- Export a thin `services/scoring/index.ts` with `recomputeDay`, `buildDailyScore` for P2 to import.

## 4. Routes

### `routes/pets.ts`
- `POST /pets`: validate `PetInputSchema`; compute `goal`, `targets` (adaptivePct 0); create; set `user.petId`; write `weighIns` row (`pet`, weightKg); `recomputeDay(today)`; respond `{ pet }` (`avatar` = `{ status:'none', ...nulls, voice: GROK_DEFAULT_VOICE }`).
- `GET /pets/:id`: owner check → `{ pet }`.
- `PUT /pets/:id`: partial merge; if `weightKg`, `idealWeightKg`, `neutered`, `activity`, `food`, or `mealsPerDay` changed → recompute targets keeping `adaptivePct`; if weightKg changed also append a `weighIns` row; `recomputeDay`.
- `POST /pets/:id/feedings`: default grams = `portionGramsPerDay / mealsPerDay`; kcal = grams × kcalPerGram; save; `recomputeDay`; `{ feeding, today: buildToday(userId) }`.
- `GET /pets/:id/feedings?date=`.

### `routes/weighins.ts`
- `POST /weighins`: validate; owner check (`user` → subjectId must equal userId; `pet` → pet.userId === userId); save; update `users.profile.weightKg` or `pets.weightKg`; run `adjustHuman`/`adjustPet` → if applied, write new targets and push `{ subject, message, at }` onto `targets.adjustmentLog` (cap 10); `recomputeDay`; respond `WeighInResponseSchema`.
- `GET /weighins?subjectType&subjectId&limit=30` → `{ weighIns, trend }`.

### `routes/scores.ts`
- `GET /scores?from&to` → `dailyScores` rows in range (max 60), `DailyScoreSchema[]`. Fill missing days with `null` entries? No — return only existing rows; the client renders gaps.

## 5. Mobile — `features/pet/`

Uses P1's `api`, `queries` (add your own hooks in `features/pet/queries.ts`: `usePet()`, `useFeed()`, `useWeighIns(subject)`, `useCreateWeighIn()`; on mutation success write `res.today` into `['today']` exactly like P1 does).

### `PetForm`
Fields per `PetInputSchema`: name, species (dog/cat/virtual segmented — choosing virtual hides weight fields and sets 10/10), breed (optional text; used for the avatar prompt), sex, neutered toggle (default on), age, current weight (kg/lb toggle), ideal weight (kg/lb; helper text "Ask your vet, or use the weight from their last healthy checkup"), activity (low/normal/high), meals per day (1–4), food name, kcal per cup + grams per cup (helper: "On the bag: 'kcal/cup'. Leave default if unsure."). Submit → `POST /pets` (or `PUT` if `existing`). Show computed portion in a success card: "Biscuit gets 132 g/day (66 g × 2)".

### `PetScreen`
Top → bottom:
1. Header: pet name, species chip, goal chip ("Losing weight → 12 kg").
2. `PortionCard`: big number "66 g" with "per meal · 132 g/day · 452 kcal", "1 of 2 meals today" progress; explanation line "RER of ideal weight × 1.0 (weight-loss factor)". Tap "How is this calculated?" → sheet with the formula and the vet disclaimer.
3. `FeedButton`: primary "Fed Biscuit (66 g)" with a small "custom amount" link → stepper sheet. On press: optimistic disable, call `useFeed()`, haptic, toast "Logged 66 g". If `today.pet.fedGrams > targetGrams × 1.1` → button turns amber with "Over today's portion".
4. `WeighInSheet`: number field (kg/lb), date default now, submit → `useCreateWeighIn()`; on response show `adjustment.message` as a toast (amber if `vetFlag` with "Consider checking with your vet").
5. `WeightChart` (Victory Native line chart): points from `useWeighIns('pet')`, target line at `idealWeightKg`, dashed projection to `projectedGoalDate` if present; caption "−0.15 kg/week · goal ≈ Jan 10".
6. "Your weight" mini-section: latest user weight, "Log weigh-in" → same sheet with `subjectType: 'user'`; shows the human adjustment message if any.
7. `AdjustmentHistory`: last 5 entries from `today.adjustments` filtered by subject.
8. Footer: "Portions are estimates. Not veterinary advice — confirm with your vet, especially for cats."

Empty states: no weigh-ins → "Add a weigh-in weekly and PetPlate will tune the portion automatically." No pet → CTA to `PetForm`.

## 6. Acceptance checks
- [ ] All specs in §2 green (`pnpm --filter api test`).
- [ ] Biscuit worked example reproduces exactly via `POST /pets` on the running API.
- [ ] Feeding twice at default grams → `today.pet.score === 100`, avatar moves toward thriving when human score is high.
- [ ] Weigh-in 14.0 → 13.7 kg over 14 days (seeded) → adjustment −5%, portion 132 → 125 g; second weigh-in 2 days later → "adjusted recently", no change.
- [ ] Cat losing 1.2%/wk → `vetFlag: true` and the amber toast.
- [ ] Virtual pet path: onboarding with `virtual` → Pet screen works with 10 kg math and no weigh-in prompt for the pet.
- [ ] `pnpm typecheck` clean; no math in the mobile code (grep for `0.75`, `Math.pow`, `70 *` in `features/pet` must return nothing).

## 7. Requests to other owners / Implementation notes
(append here)
