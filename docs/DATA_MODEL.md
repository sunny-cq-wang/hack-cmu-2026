# DATA_MODEL — MongoDB Atlas collections

All models live in `apps/api/src/db/models/`. All timestamps are `Date` (UTC). All `*Id` fields are `ObjectId` in Mongo and `string` in API payloads. Every collection has `createdAt` / `updatedAt` via Mongoose `timestamps: true`.

The nutrient shape used everywhere:

```ts
// @petplate/shared
export const NutrientsSchema = z.object({
  kcal: z.number(),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
  fiberG: z.number().default(0),
  sodiumMg: z.number().default(0),
  potassiumMg: z.number().default(0),
  calciumMg: z.number().default(0),
  ironMg: z.number().default(0),
  magnesiumMg: z.number().default(0),
  zincMg: z.number().default(0),
  vitaminCMg: z.number().default(0),
  vitaminDUg: z.number().default(0),
  vitaminARaeUg: z.number().default(0),
  folateUg: z.number().default(0),
  vitaminB12Ug: z.number().default(0),
});
```

## 1. `users`

| Field | Type | Notes |
|---|---|---|
| `auth0Sub` | string, unique index | from JWT `sub` |
| `email` | string | from token or `/userinfo` |
| `name` | string | display name |
| `timezone` | string | IANA, default `America/New_York`; app sends device tz on bootstrap |
| `profile` | object \| null | null until onboarding done |
| `profile.sex` | `'male' \| 'female'` | for Mifflin‑St Jeor + DRIs |
| `profile.age` | number | years |
| `profile.heightCm` | number | |
| `profile.weightKg` | number | latest; also written to `weighIns` |
| `profile.activity` | `'sedentary' \| 'light' \| 'moderate' \| 'active' \| 'very_active'` | |
| `profile.goal` | `'lose' \| 'maintain' \| 'gain'` | |
| `profile.targetWeightKg` | number \| null | |
| `profile.dietaryPrefs` | string[] | e.g. `['vegetarian']` |
| `profile.allergies` | string[] | |
| `targets` | object \| null | computed by `services/targets/human.ts` |
| `targets.kcal` | number | after goal offset and adaptive adjustment |
| `targets.baseKcal` | number | before adaptive adjustment |
| `targets.adaptiveOffsetKcal` | number | −300..+300 |
| `targets.proteinG` / `carbsG` / `fatG` | number | |
| `targets.micros` | `Partial<Nutrients>` | DRI values for the 12 micros |
| `targets.computedAt` | Date | |
| `petId` | ObjectId \| null | one pet per user in MVP |
| `onboardingComplete` | boolean | |

## 2. `pets`

| Field | Type | Notes |
|---|---|---|
| `userId` | ObjectId, index | |
| `name` | string | |
| `species` | `'dog' \| 'cat' \| 'virtual'` | virtual pets use dog math with a fixed 10 kg ideal weight |
| `breed` | string \| null | free text, for the Imagine prompt only |
| `sex` | `'male' \| 'female' \| null` | |
| `neutered` | boolean | affects MER factor |
| `ageYears` | number \| null | |
| `weightKg` | number | current |
| `idealWeightKg` | number | owner-entered; if unknown = current weight |
| `activity` | `'low' \| 'normal' \| 'high'` | |
| `goal` | `'lose' \| 'maintain'` | derived: lose if `weightKg > idealWeightKg * 1.05` |
| `food` | object | |
| `food.name` | string | |
| `food.kcalPerCup` | number | from bag; default 375 |
| `food.gramsPerCup` | number | default 110 |
| `targets` | object | computed by `services/targets/pet.ts` |
| `targets.rerKcal` | number | 70 × ideal^0.75 |
| `targets.merFactor` | number | |
| `targets.baseKcal` | number | rer × factor |
| `targets.adaptivePct` | number | −20..+20 (percent) |
| `targets.kcal` | number | base × (1 + adaptivePct/100), floored at rer |
| `targets.portionGramsPerDay` | number | kcal / (kcalPerCup / gramsPerCup) |
| `targets.mealsPerDay` | number | default 2 |
| `targets.computedAt` | Date | |
| `avatar` | object | written by P4 pipeline |
| `avatar.status` | `'none' \| 'generating' \| 'ready' \| 'failed'` | |
| `avatar.sourcePhotoId` | ObjectId \| null | owner's pet photo |
| `avatar.neutralPhotoId` / `thrivingPhotoId` / `droopingPhotoId` | ObjectId \| null | Imagine outputs stored in `photos` |
| `avatar.celebrationVideoUrl` | string \| null | Imagine video URL (or re-hosted) |
| `avatar.stylePrompt` | string | the prompt used, for reproducibility |
| `avatar.voice` | string | Grok TTS voice id, e.g. `Ara` |
| `avatar.imagineJobs` | `{ kind, requestId, status }[]` | async job tracking |

## 3. `meals`

| Field | Type | Notes |
|---|---|---|
| `userId` | ObjectId, index with `loggedAt` | |
| `loggedAt` | Date | |
| `dayKey` | string `YYYY-MM-DD`, index | in user tz |
| `slot` | `'breakfast' \| 'lunch' \| 'dinner' \| 'snack'` | inferred from time if not given |
| `photoId` | ObjectId \| null | |
| `source` | `'photo' \| 'manual' \| 'voice' \| 'plan'` | |
| `items` | MealItem[] | |
| `items[].name` | string | as shown to user |
| `items[].grams` | number | user-editable |
| `items[].nutrients` | Nutrients | for `grams` |
| `items[].fdcId` | number \| null | USDA match |
| `items[].matchSource` | `'usda' \| 'nutritionix' \| 'grok_estimate'` | |
| `items[].confidence` | number 0..1 | from vision |
| `totals` | Nutrients | sum of items |
| `analysis` | object \| null | raw vision output kept for debugging: `{ model, latencyMs, raw }` |

## 4. `feedings`

| Field | Type |
|---|---|
| `petId` ObjectId, `userId` ObjectId, `fedAt` Date, `dayKey` string, `grams` number, `kcal` number, `source` `'tap' \| 'voice'` |

Index: `{ petId: 1, dayKey: 1 }`.

## 5. `weighIns`

| Field | Type | Notes |
|---|---|---|
| `subjectType` | `'user' \| 'pet'` | |
| `subjectId` | ObjectId | |
| `userId` | ObjectId | owner, for auth |
| `weighedAt` | Date | |
| `weightKg` | number | |
| `note` | string \| null | |

Index: `{ subjectType: 1, subjectId: 1, weighedAt: -1 }`.

## 6. `dailyScores`

One row per user per day; upserted by `scoring.recomputeDay`.

| Field | Type | Notes |
|---|---|---|
| `userId` | ObjectId | unique with `dayKey` |
| `dayKey` | string | |
| `human` | object | `{ consumedKcal, targetKcal, proteinG, score }` |
| `pet` | object | `{ fedGrams, targetGrams, fedKcal, targetKcal, score }` |
| `combined` | number 0..100 | |
| `avatarState` | `'thriving' \| 'okay' \| 'drooping'` | |
| `mood` | `'thriving' \| 'okay' \| 'drooping'` | intraday, pace-adjusted (see ALGORITHMS §5) |
| `streakCounted` | boolean | both ≥ 70 at day close (or now, for today) |
| `streakLength` | number | as of this day |
| `finalized` | boolean | true once the day has passed in user tz |

## 7. `photos`

| Field | Type | Notes |
|---|---|---|
| `userId` | ObjectId | |
| `kind` | `'meal' \| 'pet_source' \| 'avatar'` | |
| `contentType` | string | `image/jpeg` or `image/png` |
| `data` | Buffer | ≤ 300 KB enforced |
| `width` / `height` | number | |

Served by `GET /api/photos/:id` (auth required, must own).

## 8. `mealPlans`

| Field | Type |
|---|---|
| `userId`, `forDayKey` string, `gaps` `{ nutrient: keyof Nutrients, pctOfTarget: number }[]`, `meals` `{ slot, title, ingredientLines: {name, grams}[], nutrients: Nutrients }[]`, `verified` boolean, `attempts` number |

## 9. `foods` (USDA cache)

| Field | Type | Notes |
|---|---|---|
| `queryKey` | string, unique | normalized lowercase query |
| `fdcId` | number | |
| `description` | string | |
| `per100g` | Nutrients | |
| `dataType` | string | `Foundation`, `SR Legacy`, ... |

Stretch: Atlas Search index on `description` for fuzzy matching before hitting USDA.

## 10. Demo seed shape

`pnpm --filter api seed:demo` creates: user `demo@petplate.app` (tz from env), pet `Biscuit` (dog, 14 kg, ideal 12 kg, neutered), 14 days of meals (3/day, realistic totals near target with two "bad" days), 14 days of feedings, weekly weigh-ins showing ~0.15 kg/week loss for Biscuit and ~0.4 kg/week for the user, and `dailyScores` for all 14 days with a current streak of 5.
