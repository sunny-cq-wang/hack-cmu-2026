# INTEGRATIONS

> Endpoint paths marked **VERIFY** were not confirmed against live docs at planning time. The first thing the owning agent does is open the linked doc page, confirm the path and request shape, and correct this file. Model names are **always** read from env.
>
> **§1.3 (Imagine) and §1.4 (Voice) were verified against live docs on 2026-09-12 by P4.** Remaining VERIFY notes in §1.1, §2 and §4 belong to P2 and P4-mobile respectively.

## 1. xAI / Grok — common client

- Base URL: `https://api.x.ai/v1`. OpenAI-compatible for chat, so use the `openai` npm package:

```ts
// apps/api/src/services/grok/client.ts
import OpenAI from 'openai';
import { config } from '../../config';
export const grok = new OpenAI({ apiKey: config.XAI_API_KEY, baseURL: 'https://api.x.ai/v1', timeout: 8000, maxRetries: 0 });
```

- For Imagine and Voice endpoints, use `fetchWithTimeout` from `lib/http.ts` with header `Authorization: Bearer ${XAI_API_KEY}`.
- Docs root: https://docs.x.ai — Imagine: https://docs.x.ai/developers/model-capabilities/imagine — Voice: https://docs.x.ai/docs/guides/voice
- Keys: https://console.x.ai

### 1.1 Vision meal analysis — `services/grok/vision.ts`

Structured output via `response_format: { type: 'json_schema', json_schema: {...} }` (VERIFY that structured outputs are supported on the chosen vision model; if not, fall back to `response_format: { type: 'json_object' }` + zod parse + one retry).

System prompt (use verbatim as the starting point):

```
You are a nutrition vision assistant. Identify each distinct food or drink in the photo.
For each item return: name (specific, e.g. "grilled chicken breast" not "meat"), grams (best estimate of the edible portion visible, using plate size ~27 cm as a reference), confidence 0-1, and a usdaQuery (2-4 words that would match a USDA FoodData Central Foundation or SR Legacy entry, e.g. "chicken breast grilled", "rice brown cooked").
Ignore garnish under 5 g. Merge identical items. If nothing edible is visible return an empty items array.
Output JSON only.
```

JSON schema (`VisionResultSchema` in shared):
```json
{ "type": "object", "properties": {
    "items": { "type": "array", "items": { "type": "object",
      "properties": { "name": {"type":"string"}, "grams": {"type":"number"}, "confidence": {"type":"number"}, "usdaQuery": {"type":"string"},
                      "estimatedKcal": {"type":"number"} },
      "required": ["name","grams","confidence","usdaQuery","estimatedKcal"], "additionalProperties": false } },
    "mealNotes": {"type":"string"} },
  "required": ["items"], "additionalProperties": false }
```
`estimatedKcal` is Grok's own estimate, used only as the fallback when USDA matching fails.

Image input: `{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,...', detail: 'high' } }`. Keep the JPEG ≤ 1024 px.

Timeout 8 s. On timeout/error: if `DEMO_MODE`, return canned fixture and set `analysis.fallback = true`; else throw `UPSTREAM_TIMEOUT`.

### 1.2 Chat with tools (voice agent + meal plan) — `services/grok/chat.ts`
Use standard OpenAI tool calling. Tools are defined in `services/voice/tools.ts` (P4) and executed server-side. Max 3 tool rounds.

### 1.3 Grok Imagine — `services/imagine/`

**VERIFIED 2026-09-12** against https://docs.x.ai/developers/model-capabilities/imagine (P4). Endpoints and model names below are confirmed; models are still read from env.

- Text-to-image: `POST https://api.x.ai/v1/images/generations`, body `{ model, prompt }`. Up to 10 images per request; aspect ratio, resolution and response format are configurable. Priced flat per image.
- Image editing: `POST https://api.x.ai/v1/images/edits`, body `{ model, prompt, image: { url, type: "image_url" } }` where `url` is a public URL **or** a base64 data URI (`data:image/jpeg;base64,...`). Multi-image editing accepts up to 5 source images. Billed for both input and output image.
- Video: `POST https://api.x.ai/v1/videos/generations` with `{ model, prompt, image: { url }, duration }` returns `{ request_id }`; poll `GET https://api.x.ai/v1/videos/{request_id}` until `status === 'done'` (terminal failures are `failed` and `expired`), then read `video.url`. Duration up to 15 s.
- Confirmed model names: **`grok-imagine-image-2.0`** and **`grok-imagine-video-1.5`** (the older `grok-imagine-image` / `grok-imagine-video` strings are wrong). Read from `GROK_IMAGE_MODEL` / `GROK_VIDEO_MODEL`.

Two things the public docs do **not** pin down, so `images.ts` handles both shapes:
- The REST field name for multiple references (the multi-image-editing sub-page 404s; the JS AI-SDK uses a plural `images` array). `editImage` sends `images: [...]` and retries once with the single `image` form on a 4xx.
- Whether the response carries `url` or base64. `images.ts` accepts `data[0].url`, `data[0].b64_json`, or a top-level `url`, and always returns a `Buffer`.

Avatar pipeline (`pipeline.ts`), all steps idempotent and resumable via `pets.avatar.imagineJobs`:
1. Input: owner photo (Buffer) or, for virtual pets, none.
2. Style prompt base (preset `sticker`):
   `"Turn this pet into a friendly flat-vector sticker mascot, front-facing, centered, full body, bold clean outlines, soft pastel palette, plain solid light background, no text, no watermark. Keep the pet's real coat colors and markings."`
   Virtual pet (no photo): replace "this pet" with `"a ${breedOrDescription}"`.
3. Three edits with state suffixes:
   - neutral: `"... Neutral relaxed expression, sitting."`
   - thriving: `"... Same character, same style. Beaming happy expression, eyes bright, tail up, slight bounce pose."`
   - drooping: `"... Same character, same style. Sad droopy expression, ears down, slumped posture, small sweat drop."`
   For thriving/drooping, pass BOTH the original photo and the generated neutral image as references so the character stays consistent.
4. Store each as `photos` (kind `avatar`, JPEG ≤ 300 KB via `sharp`), set `pets.avatar.*PhotoId`, `status: 'ready'` once all three exist.
5. Celebration video (non-blocking, may finish later): image-to-video from the thriving image, prompt `"The mascot does a short joyful happy dance, confetti falls, looping-friendly, 5 seconds"`, duration 5, 720p. Poll every 5 s up to 3 min in a background loop; store URL.
6. Run steps 3–5 in a fire-and-forget async function started by `POST /avatar/generate`; persist progress after each step so `GET /avatar/status` is accurate after a restart.

Demo mode: skip the API and copy the three pre-generated demo images from `apps/api/fixtures/avatar/` into `photos`.

### 1.4 Grok Voice — `services/voice/`

**VERIFIED 2026-09-12** against https://docs.x.ai/docs/guides/voice (P4). The OpenAI-style `/v1/audio/*` guesses were wrong — the real paths are `/v1/tts` and `/v1/stt`.

- **TTS**: `POST https://api.x.ai/v1/tts`, JSON body `{ text, voice_id, language }`, returns **raw audio bytes** (MP3 by default), not JSON. Supports inline speech tags and formats from MP3 down to telephony μ-law. A streaming WebSocket variant also exists.
- **STT**: `POST https://api.x.ai/v1/stt`, **multipart** with field `file`, returns JSON `{ text: string }`. 12 audio formats, word-level timestamps, 25 languages.
- Neither endpoint takes a `model` parameter, so `GROK_TTS_MODEL` / `GROK_STT_MODEL` were removed from `.env.example`. `GROK_VOICE_MODEL=grok-voice-latest` exists only for the realtime stretch.
- **Voice IDs are lowercase** and the default is `eve`. `AvatarInfoSchema.voice` in `@petplate/shared` is frozen with default `'Ara'`, so `tts.ts` normalizes with `voice.trim().toLowerCase()` and falls back to `GROK_DEFAULT_VOICE`; shared is not modified.
- Speech-to-speech realtime is `wss://api.x.ai/v1/realtime?model=grok-voice-latest` with server VAD and tool calling; use ephemeral tokens for client-side connections so the API key is never exposed. Stretch only.
- Custom voices: `POST /v1/custom-voices` (multipart `file`, max 120 s reference clip) returns a `voice_id` usable anywhere a built-in voice works. Stretch — a cloned owner voice for the pet would be a nice demo beat.

Write `stt.ts: (audio: Buffer, mime) => Promise<string | null>` and `tts.ts: (text, voice) => Promise<{ buffer, mime } | null>` so callers never see the HTTP details.

Push-to-talk flow (`POST /voice/turn`):
1. STT (timeout 10 s). If `text` was provided, skip.
2. Agent: system prompt below + `TodaySummary` JSON as context + tools; `GROK_CHAT_MODEL`.
3. Execute tool calls server-side (`tools.ts`): `get_today()`, `log_feeding({ grams? })`, `suggest_meal({ constraint? })` (calls `mealplan` for a single meal), `get_gaps()`.
4. TTS the final text (timeout 10 s) → base64.
5. On any voice failure return `reply` text with `audioBase64: null`; the app shows text and uses device TTS (`expo-speech`) as fallback.

Pet persona system prompt:
```
You are {petName}, a {species} who is also the user's diet buddy. Speak in first person as the pet, warm, 1–3 sentences, no emojis. You know today's numbers (provided). Be concrete: cite calories remaining and the top nutrient gap. If the user asks you to log your own feeding, call log_feeding. If they ask what to eat, call suggest_meal and read back the title and calories. Never give medical advice; suggest a vet or doctor for health questions.
```

Stretch — realtime: connect the app to `wss://api.x.ai/v1/realtime` **through our API** (never expose the key). Simplest transport is LiveKit Cloud with `livekit-agents` xAI plugin server-side and `@livekit/react-native` in the app. Only attempt after push-to-talk is demo-ready.

## 2. USDA FoodData Central — `services/usda/`

- Key: https://fdc.nal.usda.gov/api-key-signup (free; DEMO_KEY works for testing with tight limits). 1,000 requests/hour/key.
- Search: `GET https://api.nal.usda.gov/fdc/v1/foods/search?api_key=KEY&query=<q>&dataType=Foundation,SR%20Legacy&pageSize=5`
- Pick the first result whose `description` contains all query tokens (case-insensitive); else the first result. Prefer `Foundation` over `SR Legacy` when both match. If zero results, retry once with the first two words of the query. If still zero, `matchSource = 'grok_estimate'` and set only `kcal` from `estimatedKcal`.
- Nutrient values in `foodNutrients[]` are **per 100 g**. Map by `nutrientId`:

| field | nutrientId | unit in FDC |
|---|---|---|
| kcal | 1008 | kcal |
| proteinG | 1003 | g |
| fatG | 1004 | g |
| carbsG | 1005 | g |
| fiberG | 1079 | g |
| calciumMg | 1087 | mg |
| ironMg | 1089 | mg |
| magnesiumMg | 1090 | mg |
| potassiumMg | 1092 | mg |
| sodiumMg | 1093 | mg |
| zincMg | 1095 | mg |
| vitaminCMg | 1162 | mg |
| vitaminDUg | 1114 | µg |
| vitaminARaeUg | 1106 | µg |
| folateUg | 1177 | µg |
| vitaminB12Ug | 1178 | µg |

VERIFY the IDs against one live response on first run (they are stable, but confirm 1008 vs the "Energy" duplicates — take the kcal one, not kJ 1062).
- `scale(per100g, grams) = per100g × grams / 100` for every field.
- Cache every successful lookup in `foods` by `queryKey = query.toLowerCase().trim()`; check cache before calling. Cache hits make the demo fast and protect the rate limit.
- Timeout 4 s per call; run item lookups in parallel with `Promise.allSettled`.

Optional fallback — Nutritionix `POST https://trackapi.nutritionix.com/v2/natural/nutrients` with headers `x-app-id`, `x-app-key` and body `{ query: "150 g grilled chicken breast" }`. Free dev keys have a low daily cap, so only use when USDA returns nothing and `NUTRITIONIX_APP_ID` is set. `full_nutrients[].attr_id` uses the same USDA nutrient numbers as above (e.g., 208 = kcal in their legacy numbering — VERIFY before mapping).

## 3. Auth0

- Create a **Native** application (for the app) and an **API** (identifier = `https://api.petplate.app`, RS256).
- App: `react-native-auth0` with the Expo config plugin (`app.json` → `plugins: [["react-native-auth0", { "domain": "<tenant>.us.auth0.com" }]]`). Call `authorize({ audience: API_IDENTIFIER, scope: 'openid profile email offline_access' })`. Keep credentials with `credentialsManager`; call `getCredentials()` before every API request (it refreshes automatically).
- API middleware (`lib/auth.ts`): `jose.createRemoteJWKSet(new URL(`https://${AUTH0_DOMAIN}/.well-known/jwks.json`))`, `jwtVerify(token, jwks, { issuer: `https://${AUTH0_DOMAIN}/`, audience: AUTH0_AUDIENCE })`. Set `c.set('auth0Sub', payload.sub)`; look up or lazily create the `users` row; set `c.set('userId', ...)`.
- Dev shortcut (never in demo): if `DEV_BYPASS_AUTH=true` and header `x-dev-user: <email>`, skip verification and use/create that user. Blocked when `NODE_ENV=production`.
- Track angle: mention in the pitch that every photo, meal, and pet is scoped by Auth0 identity and that the API is a first-class Auth0 API with audience-scoped tokens.

## 4. Rive — `apps/mobile/src/features/avatar/`

- Package: `rive-react-native`. Native build required. Asset: `assets/rive/pet.riv`, artboard `Pet`, state machine `PetSM`.
- Inputs the `.riv` must expose (P4 authors the file in the Rive editor):
  - `happiness` (Number 0–100) — drives blend between drooping/okay/thriving poses and idle bounce amplitude
  - `celebrate` (Trigger) — plays the party animation once
  - `talking` (Boolean) — mouth/ears wiggle while TTS plays
- Personalization: the artboard has a referenced image asset named `petImage` in the body slot. At runtime, load the Imagine-generated image bytes and provide them via the runtime's referenced-asset loader (VERIFY the current `rive-react-native` API for out-of-band/referenced assets; if unsupported on the installed version, use the **layered fallback**: render `<Image>` of the Imagine state image underneath a transparent-background Rive overlay that only animates eyes/effects/shadow, and crossfade between the three Imagine images as `happiness` crosses 50 and 80).
- Mapping from API: `thriving → 92`, `okay → 65`, `drooping → 20`; animate the input with a 600 ms ease (`react-native-reanimated` `withTiming`, updating the Rive input on each frame via `useAnimatedReaction` or a JS interval at 30 fps).

## 5. MongoDB Atlas

- Free M0 cluster; connection string in `MONGODB_URI`. Mongoose 8. `autoIndex: true` in dev.
- Track angle: photos in the DB (no S3), nutrient documents, and (stretch) Atlas Search on `foods.description` for fuzzy matching before calling USDA. If time allows, add an Atlas Vector Search stretch: embed food descriptions and match Grok's `usdaQuery` semantically.

## 6. Hosting

- API: Railway (Node 20, `pnpm --filter api build && node dist/index.js`) or Fly. Set all env vars there. Expose `https://…/api/health`.
- App points at the hosted API via `EXPO_PUBLIC_API_BASE`. Keep a local-network fallback for the demo (`http://<laptop-ip>:3000`) in case the venue blocks outbound.
