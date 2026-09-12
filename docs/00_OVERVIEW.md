# 00 — Overview, Pitch, and Stack Decisions

## 1. One-line pitch

**People quit diets but never quit feeding their dog. PetPlate makes your diet and your pet's diet one shared streak — miss yours, and your pet's avatar droops.**

## 2. Problem and insight

Diet-tracking apps have severe churn: the user is the only one who suffers when they stop. Pet owners, by contrast, feed on schedule for years. PetPlate borrows that accountability. Your meals and your pet's meals feed one daily score; the avatar of your pet (generated from a photo of your actual pet) reflects the combined result. Guilt-by-proxy is a stronger retention hook than a streak counter.

## 3. Core feature list (MVP)

1. **Photo meal logging** — photograph a plate → Grok vision returns itemized foods with gram estimates → USDA FoodData Central supplies calories, macros, and ~12 micronutrients → one-tap confirm.
2. **Personal targets** — calories (Mifflin‑St Jeor), macros, and micronutrient DRIs computed server-side from profile; adjusted weekly from observed weight trend.
3. **Pet portioning loop** — daily kcal and gram portion from RER/MER using ideal weight; weekly weigh-ins adjust the portion within safe bounds.
4. **Shared score and streak** — human score + pet score → combined → avatar state (thriving / okay / drooping). Streak requires both ≥ 70.
5. **Generated pet avatar** — Grok Imagine edits the owner's pet photo into three stylized states; Rive animates them. Milestone reward: a 5‑second Imagine video of the pet celebrating.
6. **Talking pet (push‑to‑talk)** — Grok STT → Grok chat with tools (today's log, suggest meal, log feeding) → Grok TTS in the pet's voice.
7. **Gap-filling meal plan** — 7‑day micronutrient gaps → Grok proposes tomorrow's three meals → USDA verifies the numbers.
8. **Virtual pet** for non-owners — same loop, avatar generated from a text prompt instead of a photo.

## 4. Mapping to judging criteria

| Criterion | How PetPlate scores |
|------------|----------------------------------------|
| Originality | The pet-accountability mechanic and the personalized avatar-from-your-real-pet are not in any existing tracker. |
| Technical difficulty | Four AI integrations (vision, image edit, image‑to‑video, speech) + two verified nutrition pipelines + two adaptive control loops sharing one architecture. |
| Demo quality | Everything risky is pre-generated or cached. Live path: photo → itemized result → avatar reacts → pet fed → streak ticks. Under two minutes, no typing. |
| Usefulness | Directly attacks the stated problem (churn). Micronutrient gaps and verified meal plans go beyond calorie counting. |
| Food track | Human meal recognition and nutrition are the core; pet nutrition reinforces the theme rather than diluting it. |
| Sponsor tracks | xAI (Grok vision, Imagine, Voice), Auth0 (all auth), MongoDB Atlas (all data incl. photos; Atlas Search stretch for food lookup). |

## 5. Final stack and why

| Layer | Decision | Rationale / trade-off accepted |
|--------|------------------------|--------------------------------|
| Mobile | **Expo (React Native), Expo Router, TypeScript**, dev build via `expo run:*` or EAS | Fastest path to a working camera app on both platforms. Expo Go is NOT usable (native modules for Auth0, Rive, audio). |
| Backend | **Hono on Node 20, TypeScript** | Same language as the app; shared zod types; near-zero boilerplate. |
| Shared | `@petplate/shared` — zod schemas + inferred TS types + constants | Single source of truth for every payload. |
| Auth | **Auth0** (Universal Login via `react-native-auth0`; API verifies RS256 JWT via JWKS) | Sponsor track. Adds a dev-build requirement we already have. |
| Database | **MongoDB Atlas** via Mongoose | Sponsor track. Nutrient blobs are naturally document-shaped. Photos stored as compressed JPEG Buffers in a `photos` collection (no third storage service). |
| Vision | **Grok chat model with image input + JSON-schema structured output** | Track requirement. Returns foods + grams + confidence. |
| Nutrition | **USDA FoodData Central** (primary) · Nutritionix natural-language endpoint (optional fallback for branded items) · Edamam dropped | USDA is free, unlimited enough, and has full micronutrients. Edamam's free tier is calories + tags only; Nutritionix free keys have a low daily cap. USDA requires name→food matching and per‑100 g scaling; Grok already gives grams, so this is cheap. |
| Avatar art | **Grok Imagine** image edit with the pet photo as reference (3 states) + image‑to‑video for milestone clip | Personalization judges will remember; all generated at onboarding and cached, so zero live risk. |
| Avatar motion | **Rive** (`rive-react-native`) with a state machine driven by a numeric `happiness` input; Imagine image swapped in as a referenced asset, with a layered fallback | Continuous blending between states; light runtime. Requires dev build. |
| Voice | **Grok STT → Grok chat (tools) → Grok TTS**, push‑to‑talk | Demo-safe; realtime WebSocket (`wss://api.x.ai/v1/realtime`) is a stretch. |
| Charts | Victory Native | Weight trend and weekly score. |
| Hosting | API on Railway or Fly.io; Atlas free tier; Auth0 free tier | All free for the weekend. |

## 6. Explicitly out of scope

Social feed, friends, notifications/push, barcode scanning, custom pet-food formulation, multi-pet households (one pet per user in MVP), Android widgets, offline mode, App Store submission.

## 7. Safety and disclaimers (must ship)

- Pet screens show: *"Portions are estimates. Not veterinary advice — confirm with your vet, especially for cats."*
- Human screens show: *"Not medical advice."*
- The app never suggests a calorie target below 1,200 kcal (female) / 1,500 kcal (male) and never a pet portion below RER of ideal weight.
