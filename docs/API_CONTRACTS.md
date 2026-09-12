# API_CONTRACTS

Base URL: `${API_BASE}/api`. All endpoints require `Authorization: Bearer <Auth0 access token>` unless marked public. All bodies are JSON unless marked multipart. All schemas below exist in `@petplate/shared` — import them; do not retype.

Error envelope (any 4xx/5xx):

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "grams must be > 0" } }
```

Codes: `UNAUTHORIZED` 401 · `FORBIDDEN` 403 · `NOT_FOUND` 404 · `VALIDATION_ERROR` 400 · `ONBOARDING_REQUIRED` 409 · `UPSTREAM_TIMEOUT` 504 · `UPSTREAM_ERROR` 502 · `RATE_LIMITED` 429 · `INTERNAL` 500.

Common types (see `packages/shared/src/types.ts`): `Nutrients`, `MealItem`, `Meal`, `Pet`, `PetTargets`, `HumanTargets`, `TodaySummary`, `AvatarState = 'thriving'|'okay'|'drooping'`.

---

## 1. Identity and profile (P2)

### `POST /me/bootstrap`
Creates the user on first login. Idempotent.

Request: `{ "timezone": "America/New_York", "name": "Simon" }`

Response 200:
```json
{
  "user": {
    "id": "66f...", "email": "s@x.com", "name": "Simon", "timezone": "America/New_York",
    "onboardingComplete": false, "petId": null,
    "profile": null, "targets": null
  }
}
```

### `PUT /me/profile`
Request: `HumanProfile` (see shared). Server recomputes `targets` and writes a `weighIns` row for `weightKg`.

Response 200: `{ "user": User }` (with `targets` filled).

### `GET /me/today`
The dashboard payload. Read-only; returns the stored `dailyScores` row for today (creating an empty one if missing).

Response 200 — `TodaySummary`:
```json
{
  "dayKey": "2026-09-12",
  "human": {
    "consumed": { "kcal": 1420, "proteinG": 88, "carbsG": 150, "fatG": 50, "fiberG": 18, "...": 0 },
    "targets":  { "kcal": 2100, "proteinG": 130, "carbsG": 236, "fatG": 58 },
    "score": 74,
    "mealsLogged": 2
  },
  "pet": {
    "petId": "66f...", "name": "Biscuit", "species": "dog",
    "fedGrams": 92, "targetGrams": 184, "fedKcal": 314, "targetKcal": 627,
    "feedingsToday": 1, "mealsPerDay": 2,
    "score": 50
  },
  "combined": 62,
  "avatarState": "okay",
  "mood": "okay",
  "streak": { "length": 5, "todayCounted": false, "bothAboveThreshold": false },
  "avatar": {
    "status": "ready",
    "neutralUrl": "/api/photos/66f...", "thrivingUrl": "/api/photos/66f...", "droopingUrl": "/api/photos/66f...",
    "celebrationVideoUrl": null,
    "voice": "Ara"
  },
  "adjustments": [
    { "subject": "pet", "message": "Biscuit's portion moved to 184 g/day (−5%) after last weigh-in.", "at": "2026-09-11T14:02:00Z" }
  ]
}
```
409 `ONBOARDING_REQUIRED` if `profile` is null.

---

## 2. Meals (P2)

### `POST /meals/analyze` — multipart
Fields: `photo` (JPEG ≤ 1024 px), optional `hint` (string, e.g. "lunch"). Does **not** save a meal.

Response 200 — `MealDraft`:
```json
{
  "photoId": "66f...",
  "items": [
    { "name": "Grilled chicken breast", "grams": 150, "confidence": 0.91,
      "nutrients": { "kcal": 248, "proteinG": 46.5, "...": 0 },
      "fdcId": 171477, "matchSource": "usda" },
    { "name": "Brown rice, cooked", "grams": 180, "confidence": 0.84,
      "nutrients": { "kcal": 200, "...": 0 }, "fdcId": 169704, "matchSource": "usda" }
  ],
  "totals": { "kcal": 448, "...": 0 },
  "analysis": { "model": "grok-...", "latencyMs": 2310, "fallback": false }
}
```
504 `UPSTREAM_TIMEOUT` only if Grok times out **and** `DEMO_MODE` is off.

### `POST /meals`
Request:
```json
{
  "photoId": "66f..." ,
  "slot": "lunch",
  "loggedAt": "2026-09-12T16:10:00Z",
  "source": "photo",
  "items": [ { "name": "Grilled chicken breast", "grams": 140, "fdcId": 171477 }, { "name": "Brown rice, cooked", "grams": 180, "fdcId": 169704 } ]
}
```
Server re-enriches nutrients from `fdcId` (or name lookup if null), saves, calls `scoring.recomputeDay`.

Response 201: `{ "meal": Meal, "today": TodaySummary }`

### `GET /meals?date=YYYY-MM-DD` → `{ "meals": Meal[] }`
### `DELETE /meals/:id` → 204, recomputes day.

---

## 3. Pets, feedings, weigh-ins (P3)

### `POST /pets`
Request — `PetInput`:
```json
{ "name": "Biscuit", "species": "dog", "breed": "Beagle mix", "sex": "male", "neutered": true,
  "ageYears": 4, "weightKg": 14, "idealWeightKg": 12, "activity": "normal",
  "food": { "name": "Blue Buffalo Adult", "kcalPerCup": 377, "gramsPerCup": 110 } }
```
Response 201: `{ "pet": Pet }` with `targets` computed. Links `user.petId`.

### `GET /pets/:id` → `{ "pet": Pet }`
### `PUT /pets/:id` → same as POST body (partial allowed); recomputes targets.

### `POST /pets/:id/feedings`
Request: `{ "grams": 92, "fedAt": "2026-09-12T12:00:00Z", "source": "tap" }` (`grams` optional → defaults to `targets.portionGramsPerDay / mealsPerDay`).
Response 201: `{ "feeding": Feeding, "today": TodaySummary }`

### `GET /pets/:id/feedings?date=YYYY-MM-DD` → `{ "feedings": Feeding[] }`

### `POST /weighins`
Request: `{ "subjectType": "pet", "subjectId": "66f...", "weightKg": 13.7, "weighedAt": "2026-09-12T08:00:00Z" }`
Server saves, runs the adaptive loop for that subject (ALGORITHMS §4), returns the adjustment.

Response 201:
```json
{
  "weighIn": { "id": "...", "subjectType": "pet", "subjectId": "...", "weightKg": 13.7, "weighedAt": "..." },
  "adjustment": {
    "applied": true,
    "before": { "kcal": 660, "portionGramsPerDay": 194 },
    "after":  { "kcal": 627, "portionGramsPerDay": 184 },
    "observedWeeklyChangePct": -0.3,
    "targetWeeklyChangePct": [-2.0, -0.5],
    "message": "Biscuit lost 0.3%/week; target is 0.5–2%. Portion reduced 5% to 184 g/day.",
    "vetFlag": false
  },
  "trend": { "points": [ { "at": "...", "kg": 14.0 }, { "at": "...", "kg": 13.7 } ], "slopeKgPerWeek": -0.15, "projectedGoalDate": "2027-01-10" }
}
```
For `subjectType: "user"`, `after` has `{ kcal }` only and `adjustment.message` is about the calorie target.

### `GET /weighins?subjectType=pet&subjectId=...&limit=30` → `{ "weighIns": WeighIn[], "trend": Trend }`

---

## 4. Nutrition and meal plans (P2)

### `GET /nutrition/gaps?days=7`
Response 200:
```json
{
  "days": 7,
  "avgIntake": { "kcal": 1980, "fiberG": 14, "ironMg": 9, "...": 0 },
  "targets":   { "fiberG": 38, "ironMg": 8, "...": 0 },
  "gaps": [
    { "nutrient": "fiberG", "pctOfTarget": 37, "label": "Fiber", "suggestFoods": ["lentils", "raspberries", "oats"] },
    { "nutrient": "potassiumMg", "pctOfTarget": 55, "label": "Potassium", "suggestFoods": ["banana", "white beans", "spinach"] }
  ]
}
```
`gaps` = nutrients below 70% of target, sorted ascending by pct; max 5.

### `POST /mealplans/generate`
Request: `{ "forDayKey": "2026-09-13" }` (optional; default tomorrow).
Response 200: `{ "plan": MealPlan }` — see DATA_MODEL §8; `verified: true` means USDA-computed totals are within ±10% of remaining kcal and every listed gap ≥ 70% after the plan.

---

## 5. Avatar (P4)

### `POST /avatar/generate` — multipart
Fields: `photo` (owner's pet photo, optional for virtual pets), `stylePreset` (`'sticker' | 'watercolor' | 'pixel'`, default `sticker`).
Kicks off the Imagine pipeline asynchronously. Response 202: `{ "status": "generating", "jobId": "..." }`

### `GET /avatar/status`
Response 200: `{ "status": "none"|"generating"|"ready"|"failed", "progress": { "neutral": true, "thriving": true, "drooping": false, "video": false }, "avatar": TodaySummary["avatar"] | null }`

### `POST /avatar/celebrate`
Requests generation of the celebration video if missing (idempotent). 202.

---

## 6. Voice (P4)

### `POST /voice/turn` — multipart
Fields: `audio` (m4a/wav ≤ 20 s), optional `text` (skip STT). Server: STT → agent w/ tools → TTS.

Response 200:
```json
{
  "transcript": "Biscuit, what should I have for dinner?",
  "reply": "You're 680 calories under and low on fiber. A lentil curry with brown rice would fix both.",
  "audioBase64": "....", "audioMime": "audio/mpeg",
  "actions": [ { "type": "suggest_meal", "payload": { "title": "Lentil curry with brown rice", "kcal": 640 } } ],
  "today": TodaySummary
}
```
`actions[].type ∈ 'log_feeding' | 'suggest_meal' | 'none'`. If a feeding was logged via voice, `today` reflects it.

---

## 7. Misc

### `GET /scores?from=YYYY-MM-DD&to=YYYY-MM-DD` → `{ "days": DailyScore[] }` (P3)
### `GET /photos/:id` → image bytes, `Cache-Control: private, max-age=86400` (P2)
### `GET /health` — public → `{ "ok": true, "demoMode": false }`
