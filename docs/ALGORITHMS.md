# ALGORITHMS

Every function here is pure, lives under `apps/api/src/services/`, and has a vitest spec. Numbers are deliberately explicit so an agent can implement without judgment calls. Where a value is a policy choice, it is marked **(policy)** — change it in `packages/shared/src/constants.ts`, not inline.

## 1. Human targets — `services/targets/human.ts`

### 1.1 BMR (Mifflin‑St Jeor)
```
male:   BMR = 10*weightKg + 6.25*heightCm − 5*age + 5
female: BMR = 10*weightKg + 6.25*heightCm − 5*age − 161
```

### 1.2 TDEE
| activity | factor |
|---|---|
| sedentary | 1.2 |
| light | 1.375 |
| moderate | 1.55 |
| active | 1.725 |
| very_active | 1.9 |

`TDEE = BMR × factor`

### 1.3 Goal offset **(policy)**
| goal | offset |
|---|---|
| lose | −500 |
| maintain | 0 |
| gain | +300 |

`baseKcal = round(TDEE + offset)`, then floor: `max(baseKcal, sex === 'female' ? 1200 : 1500)`.

### 1.4 Adaptive offset
`kcal = clamp(baseKcal + adaptiveOffsetKcal, floor, baseKcal + 300)` where `adaptiveOffsetKcal ∈ [−300, +300]`, updated by §4.

### 1.5 Macros **(policy)**
```
proteinG = round(1.6 * weightKg)
fatG     = round(0.25 * kcal / 9)
carbsG   = round((kcal − proteinG*4 − fatG*9) / 4)   // never below 50
```

### 1.6 Micronutrient targets (adult DRIs, 19–50) **(policy; in constants.ts)**
| nutrient | female | male |
|---|---|---|
| fiberG | 25 | 38 |
| sodiumMg (upper limit, tracked as "≤") | 2300 | 2300 |
| potassiumMg | 2600 | 3400 |
| calciumMg | 1000 | 1000 |
| ironMg | 18 | 8 |
| magnesiumMg | 310 | 400 |
| zincMg | 8 | 11 |
| vitaminCMg | 75 | 90 |
| vitaminDUg | 15 | 15 |
| vitaminARaeUg | 700 | 900 |
| folateUg | 400 | 400 |
| vitaminB12Ug | 2.4 | 2.4 |

If `age > 50`: calciumMg 1200, vitaminDUg 20 (both sexes), ironMg 8 (female). Sodium is an upper limit: it never appears in "gaps", and its display is "X% of limit".

## 2. Pet targets — `services/targets/pet.ts`

### 2.1 Reference weight
```
refKg = goal === 'lose' ? idealWeightKg : weightKg
goal = weightKg > idealWeightKg * 1.05 ? 'lose' : 'maintain'
```
Virtual pets: `species = 'virtual'`, treat as dog, `weightKg = idealWeightKg = 10`, `neutered = true`.

### 2.2 RER
`rerKcal = 70 × refKg^0.75`

### 2.3 MER factor **(policy)**
| species | condition | factor |
|---|---|---|
| dog | lose | 1.0 |
| dog | maintain, neutered | 1.6 |
| dog | maintain, intact | 1.8 |
| dog | activity high (add) | +0.2 |
| dog | activity low (add) | −0.2 |
| cat | lose | 0.8 |
| cat | maintain, neutered | 1.2 |
| cat | maintain, intact | 1.4 |
| cat | activity high / low | +0.1 / −0.1 |

For `lose`, activity adjustments are **not** applied.

### 2.4 Daily kcal and portion
```
baseKcal = rerKcal × merFactor
kcal     = max(baseKcal × (1 + adaptivePct/100), rerKcal)      // never below RER (policy: safety floor)
kcalPerGram = food.kcalPerCup / food.gramsPerCup                 // defaults 375 / 110
portionGramsPerDay = round(kcal / kcalPerGram)
perMealGrams = round(portionGramsPerDay / mealsPerDay)
```
`adaptivePct ∈ [−20, +20]` **(policy)**, updated by §4.

Worked example (Biscuit): dog, 14 kg, ideal 12 kg → lose; RER = 70 × 12^0.75 = 70 × 6.45 = 451.5; factor 1.0; baseKcal 452; kcalPerGram 377/110 = 3.43; portion 132 g/day, 66 g/meal.

## 3. Daily score — `services/scoring/score.ts`

### 3.1 Human score (0–100)
```
pct = consumedKcal / targetKcal × 100
kcalScore = clamp(100 − 2 × |pct − 100|, 0, 100)          // ±5% → ≥90; ±25% → 50; ±50% → 0
proteinBonus = min(10, 10 × consumedProteinG / targetProteinG)
humanScore = round(clamp(kcalScore × 0.9 + proteinBonus, 0, 100))
```
If `consumedKcal === 0` → `humanScore = 0`.

### 3.2 Pet score (0–100)
```
pct = fedGrams / targetGramsPerDay × 100
petScore = round(clamp(100 − 2 × |pct − 100|, 0, 100))
```
Overfeeding is penalized symmetrically — that is the point of the mirror.

### 3.3 Combined and avatar state **(policy)**
```
combined = round(0.5 × humanScore + 0.5 × petScore)
avatarState = combined >= 80 ? 'thriving' : combined >= 50 ? 'okay' : 'drooping'
```

### 3.4 Streak — `services/scoring/streak.ts`
A day counts if `humanScore >= 70 && petScore >= 70` at the end of that day (user tz). `streakLength(dayKey)` = number of consecutive counted days ending at the most recent finalized day, plus 1 if today already qualifies. Missing `dailyScores` rows count as not counted. A gap of one day resets to 0 (no freeze days in MVP).

### 3.5 Intraday mood — `services/scoring/avatarState.ts`
`avatarState` alone would show "drooping" every morning. `mood` is pace-adjusted:
```
hour = local hour (0–23)
expectedFrac = clamp((hour − 7) / 14, 0.15, 1)      // 7:00 → 15%, 21:00+ → 100%
pacedHuman = consumedKcal / (targetKcal × expectedFrac)
pacedPet   = fedGrams / (targetGrams × expectedFrac)
pacedScore(x) = clamp(100 − 2 × |x×100 − 100|, 0, 100)
moodCombined = 0.5 × pacedScore(pacedHuman) + 0.5 × pacedScore(pacedPet)
mood = same thresholds as avatarState
```
The UI animates from `mood` during the day; `avatarState` is what is stored for history and what the streak uses at day close. After 21:00 local, `mood === avatarState`.

### 3.6 `recomputeDay(userId, dayKey)` — orchestrator
1. Sum `meals.totals` for the day → `consumed`.
2. Sum `feedings.grams` for the pet → `fedGrams`.
3. Load current targets from `users.targets` and `pets.targets`.
4. Compute §3.1–3.5.
5. Upsert `dailyScores`. Set `finalized = dayKey < todayKey(tz)`.
6. If `streakCounted` flipped to true today → return `{ celebrate: true }` so the caller can trigger the avatar celebration.

Call `recomputeDay` after every write to `meals`, `feedings`, or targets. Never from `GET` handlers.

## 4. Adaptive loops — `services/targets/adaptive.ts`

Both loops use the same helper:
```
weeklyChangePct(weighIns, windowDays = 14):
  points = weighIns in last windowDays, sorted asc; require ≥ 2 points spanning ≥ 5 days, else return null
  slopeKgPerDay = least-squares slope
  return slopeKgPerDay × 7 / latestKg × 100
```

### 4.1 Pet loop **(policy)**
| species | goal | target weekly change % |
|---|---|---|
| dog | lose | −2.0 … −0.5 |
| cat | lose | −1.0 … −0.5 |
| any | maintain | −0.5 … +0.5 |

```
obs = weeklyChangePct(...)
if obs === null → no change, message "Need one more weigh-in to adjust."
lose:
  obs > −0.5 (losing too slowly or gaining) → adaptivePct −= 5
  obs < lowerBound (losing too fast)        → adaptivePct += 10, vetFlag = true
maintain:
  obs > +0.5 → adaptivePct −= 5
  obs < −0.5 → adaptivePct += 5
clamp adaptivePct to [−20, +20]; recompute §2.4; kcal never below RER (floor applies after adaptation)
vetFlag also = true for cats whenever obs < −1.0
```
At most one adjustment per 7 days per pet (`targets.lastAdjustedAt`).

### 4.2 Human loop **(policy)**
Expected weekly change: lose −0.5 kg/wk (≈ −0.6% at 80 kg), maintain 0, gain +0.25 kg/wk. Use absolute kg here, not %.
```
obsKgPerWeek = slopeKgPerDay × 7
lose:     obs > −0.25 → offset −= 100 ;  obs < −1.0 → offset += 100
maintain: |obs| > 0.4 → offset −= sign(obs) × 100
gain:     obs < 0.1  → offset += 100 ;  obs > 0.6  → offset −= 100
clamp offset to [−300, +300]; recompute §1.4 (floors apply)
```
At most one adjustment per 7 days.

### 4.3 Trend output
`trend = { points, slopeKgPerWeek, projectedGoalDate }` where `projectedGoalDate = today + (latestKg − targetKg) / |slopeKgPerWeek| weeks` if the slope has the right sign, else `null`.

## 5. Micronutrient gaps — `services/nutrition/gaps.ts`
```
avgIntake = mean of dailyTotals over last N days that have ≥ 1 meal (min 1 day)
for each micro in targets.micros except sodiumMg:
  pct = avgIntake[micro] / target[micro] × 100
gaps = micros with pct < 70, sorted asc, take 5
suggestFoods = static map in constants.ts (3 foods per nutrient)
```

## 6. Meal plan generation — `services/mealplan/generate.ts`
```
remainingKcal = targets.kcal (plan is for tomorrow, full day)
gaps = gaps(7)
attempt = 0
loop (max 2 attempts):
  prompt Grok chat (JSON schema MealPlanProposal): 3 meals; each has title + ingredientLines[{name, grams}];
    constraints: total ≈ remainingKcal ±10%; prioritize foods that close `gaps`; respect dietaryPrefs/allergies;
    on attempt 2 include `feedback` from the previous verification
  enrich every ingredient line via USDA → nutrients per meal and per day
  verify: |dayKcal − remainingKcal| ≤ 10% AND every gap nutrient ≥ 70% of target
  if verified → save { verified: true } and return
  else feedback = list of failing constraints with numbers
save best attempt with verified: false
```

## 7. Constants file — `packages/shared/src/constants.ts`
Must contain: ACTIVITY_FACTORS, GOAL_OFFSETS, KCAL_FLOORS, DRI_TABLE, MER_FACTORS, PET_WEEKLY_TARGETS, HUMAN_WEEKLY_TARGETS, SCORE_THRESHOLDS `{ streak: 70, thriving: 80, okay: 50 }`, GAP_THRESHOLD_PCT 70, SUGGEST_FOODS map, DEFAULT_FOOD `{ kcalPerCup: 375, gramsPerCup: 110 }`.
