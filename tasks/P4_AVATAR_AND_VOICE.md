# P4 — Avatar (Grok Imagine + Rive) and Voice (Grok STT → chat tools → TTS)

> Self-contained brief for one implementing agent. Read `AGENTS.md` first. Then read: `docs/INTEGRATIONS.md` §1 (all), §4; `docs/API_CONTRACTS.md` §5, §6; `docs/DATA_MODEL.md` §2 (`avatar` sub-doc), §7; `docs/ARCHITECTURE.md` §3, §4, §6, §7. You do not need ALGORITHMS.md beyond knowing that `avatarState`/`mood` arrive from `/me/today`.

## 0. Your ownership

API: `apps/api/src/services/imagine/**`, `apps/api/src/services/voice/**`, `apps/api/src/routes/avatar.ts`, `apps/api/src/routes/voice.ts`, `apps/api/fixtures/avatar/**`.
Mobile: `apps/mobile/src/features/avatar/**`, `apps/mobile/src/features/voice/**`, `apps/mobile/assets/rive/pet.riv`.
You export exactly: `PetAvatar`, `AvatarGenerator`, `TalkButton` (signatures in P1 §6).

## 1. Hour-zero tasks (before anything else)

1. Create an xAI API key at console.x.ai. Confirm in the docs the **current** model names and exact endpoints for: image generation, image editing with reference images, image-to-video, TTS, STT. Correct `docs/INTEGRATIONS.md` §1.3/§1.4 and `.env.example` — replace every **VERIFY** note with the confirmed value. Commit that first.
2. Make one successful call of each kind from a scratch script (`apps/api/scripts/scratch/imagine.ts`, `voice.ts`) and save the outputs. If any endpoint is unavailable to your key, say so in the team channel within the first hour — it changes the plan (see §7).
3. Open the Rive editor and build `pet.riv` (spec in §4). Export and commit.

## 2. Deliverables (MVP, in order)

1. `services/imagine/images.ts`: `generateImage(prompt): Promise<Buffer>`, `editImage(prompt, refs: Buffer[]): Promise<Buffer>`.
2. `services/imagine/video.ts`: `startImageToVideo(prompt, ref: Buffer, seconds): Promise<{ requestId }>`, `pollVideo(requestId): Promise<{ status: 'pending'|'done'|'failed'; url?: string }>`.
3. `services/imagine/pipeline.ts`: `startAvatarPipeline(petId, sourcePhoto?: Buffer, preset)` (fire-and-forget, resumable) per INTEGRATIONS §1.3 steps 1–6; `getAvatarStatus(petId)`.
4. `routes/avatar.ts`: `POST /avatar/generate`, `GET /avatar/status`, `POST /avatar/celebrate`.
5. Demo fixtures: three pre-generated images + one video for the demo pet, used when `DEMO_MODE`.
6. `pet.riv` with inputs `happiness`, `celebrate`, `talking` and the referenced image slot `petImage`.
7. Mobile `PetAvatar` (Rive-driven, reads `useToday()`), `AvatarGenerator` (onboarding upload + progress), `CelebrationVideo` (plays on `celebrate`).
8. `services/voice/stt.ts`, `tts.ts`, `tools.ts`, `agent.ts`; `routes/voice.ts` `POST /voice/turn`.
9. Mobile `TalkButton` + `VoiceSheet` (push-to-talk, transcript, reply, audio playback, `talking` input while playing).

Stretch: realtime voice via `wss://api.x.ai/v1/realtime` (through LiveKit); style presets (watercolor/pixel); "pet reacts to meal" — after a meal is logged, generate a one-line Grok comment and TTS it automatically.

## 3. Imagine pipeline — implementation detail

### `images.ts`
- Use `fetchWithTimeout` (P2's `lib/http.ts`), 60 s for images. Return a `Buffer` regardless of whether the API gives a URL (fetch it) or base64 (decode). Convert to JPEG ≤ 300 KB with `sharp` (`.jpeg({ quality: 85 })`, downscale to 768 px max side).
- Log the prompt, latency, and byte size.

### `pipeline.ts`
```ts
export async function startAvatarPipeline(petId: string, source: Buffer | null, preset: 'sticker'|'watercolor'|'pixel'): Promise<void>
```
- Set `avatar.status = 'generating'`, persist `stylePrompt`.
- Step order and prompts exactly as INTEGRATIONS §1.3. Each step: check `avatar.<state>PhotoId`; if present skip (resumable). After each success, store the image via P2's `photos.store(userId, 'avatar', buf)` and persist the id immediately.
- Consistency trick: for `thriving` and `drooping`, pass refs `[source, neutralBuffer]` (or `[neutralBuffer]` for virtual pets) and prefix the prompt with `"Use the second image as the exact character to reproduce. "` if the API supports ordered references; otherwise just include both.
- Video: start after the three images; poll every 5 s for ≤ 3 min in a detached loop; on `done` store the URL (re-host: download and store as `photos` kind `avatar` with `contentType: video/mp4` if ≤ 5 MB, else keep the URL). On failure leave `celebrationVideoUrl: null` — it is optional.
- Any failure after ≥ 1 image → `status: 'ready'` with the available images (the UI can fall back to `neutral` for missing states). Zero images → `status: 'failed'`.
- Wrap the whole thing in `try/catch`; never throw out of the fire-and-forget promise. Log everything.

### `routes/avatar.ts`
- `POST /avatar/generate` (multipart): require `user.petId`; read `photo` if present; `sharp` normalize (JPEG, ≤ 1024); store as `photos` kind `pet_source`; `void startAvatarPipeline(...)`; 202 `{ status: 'generating', jobId: petId }`.
- In `DEMO_MODE`: instead of the pipeline, copy `fixtures/avatar/{neutral,thriving,drooping}.jpg` and `celebration.mp4` into `photos` and mark ready synchronously.
- `GET /avatar/status` → `AvatarStatusSchema`.
- `POST /avatar/celebrate` → start the video step only if `celebrationVideoUrl` is null and no job pending. 202.

## 4. Rive file — `assets/rive/pet.riv`

Artboard `Pet` (512×512). State machine `PetSM`:
- Inputs: `happiness` Number (default 65), `celebrate` Trigger, `talking` Boolean.
- Layer "body": three animations `Droop`, `Idle`, `Bounce`; use a **blend state (1D)** on `happiness`: 0 → Droop, 50 → Idle, 100 → Bounce. If blend states are awkward, use three states with transitions on `happiness < 40`, `40–79`, `≥ 80` and 300 ms blend durations.
- Layer "effects": `Confetti` animation entered on `celebrate` trigger, exits to `Empty` after 1.5 s.
- Layer "talk": `Talk` (ears/mouth wiggle loop) when `talking == true`, else `Empty`.
- Image: a referenced image asset named `petImage` placed in the body slot, scaled to fit a 400×400 region, with a subtle drop shadow shape beneath that scales with the bounce.
- Keep the file under 300 KB. Placeholder `petImage` = a neutral generic dog silhouette so the component renders before generation.

If the Rive editor is unfamiliar, budget 90 minutes max. If you can't get the referenced-asset swap working in `rive-react-native` within another 60 minutes, switch to the **layered fallback** (INTEGRATIONS §4) and only animate effects/shadow in Rive.

## 5. Mobile components

### `PetAvatar({ size = 220 })`
- `const { data } = useToday()`; `status = data?.avatar?.status`.
- Choose the image for the current `mood`: `thriving → thrivingUrl`, `okay → neutralUrl`, `drooping → droopingUrl`; fall back to `neutralUrl`, then the bundled placeholder.
- Rive: `<Rive resourceName="pet" artboardName="Pet" stateMachineName="PetSM" />` with a ref; on mount and whenever the chosen image URL changes, load bytes (`fetch` with the auth header via P1's `api` helper or a `getPhotoBytes(url)` util you add in `features/avatar/lib.ts`) and set the referenced asset.
- Map mood → target happiness (`92/65/20`); animate with Reanimated `withTiming(target, { duration: 600 })` and push the value into `ref.current.setInputState('PetSM','happiness', v)` from a `useAnimatedReaction` → `runOnJS` bridge (or a 30 fps JS interval during the 600 ms).
- Listen for `celebrate`: P1 writes `today` after mutations; detect `streak.todayCounted` flipping from false→true (keep a `useRef` of the last value) → `fireState('PetSM','celebrate')` and, if `celebrationVideoUrl`, mount `<CelebrationVideo url />` (expo-av/expo-video, 5 s, auto-dismiss).
- Expose a tiny store (`zustand` or a module-level `useSyncExternalStore`) `avatarTalking.set(bool)` so `VoiceSheet` can toggle the `talking` input.
- Layered fallback: `<Image>` of the mood image underneath, Rive overlay (transparent) on top, crossfade images with `Animated.Image` opacity over 400 ms.

### `AvatarGenerator({ onReady })`
- Screen: "Meet your buddy." Photo picker (camera or library) → preview → "Generate" (or "Use a virtual pet" if the pet species is `virtual` — skip the photo). Style preset chips (sticker default).
- `POST /avatar/generate` multipart → then poll `GET /avatar/status` every 3 s. Show three placeholder tiles that fill in as `progress.neutral/thriving/drooping` become true; caption under each ("thriving", "okay", "drooping"). Copy: "Grok Imagine is drawing three moods of {name} from your photo. ~1–2 minutes."
- When `status === 'ready'` → button "Continue" → `onReady()`. When `failed` → "Try again" and "Continue with a placeholder".
- Do not block on the video.

### `TalkButton` / `VoiceSheet`
- Floating 56 px round button (mic icon). Press-and-hold → record (`expo-audio` `useAudioRecorder`, m4a AAC, 16 kHz mono if configurable); release → stop; show the sheet with a waveform placeholder and "Sending…".
- `POST /voice/turn` multipart (`audio`) → response: show `transcript` (grey, italic) and `reply` (pet name as the speaker); if `audioBase64`, write to cache dir and play with `expo-audio`; set `avatarTalking(true)` while playing, false on finish. If `audioBase64` is null → `expo-speech` `speak(reply)`.
- Write `response.today` into the `['today']` query cache (same as P1's mutations) so a voice-logged feeding updates Home.
- `actions`: `suggest_meal` → render a card with title/kcal and "Log it" → calls P1's `useCreateMeal()` with `source: 'voice'` and `items` from `payload.ingredientLines` if present, else a single item `{ name: title, grams: 350, fdcId: null }`.
- Text fallback: a "type instead" link sends `text` in the form instead of audio.
- Max recording 20 s; show a countdown ring.

## 6. Voice backend

### `stt.ts` / `tts.ts`
Exactly the signatures in INTEGRATIONS §1.4. TTS output: request MP3 if selectable; return `{ buffer, mime }`. Both 10 s timeouts. Both return `null` on failure (log), never throw — `agent.ts` degrades.

### `tools.ts`
OpenAI tool definitions + executors (all take `userId`):
```ts
get_today()                → TodaySummary (via P2's buildToday)
get_gaps()                 → GapsResponse (via P2's gaps service)
log_feeding({ grams?: number }) → calls P3's feedings logic (import the same service function P3's route uses; if only the route exists, extract a service function together) → returns { logged: true, grams, today }
suggest_meal({ constraint?: string }) → single-meal variant of P2's generator: prompt for ONE meal ≈ remaining kcal today (targets.kcal − consumed.kcal, min 300) prioritizing gaps → enrich via USDA → { title, kcal, ingredientLines }
```
Every executor returns a compact JSON string for the model and pushes an `actions[]` entry when it has a side effect or a suggestion.

### `agent.ts`
```ts
export async function runPetAgent(userId: string, userText: string): Promise<{ reply: string; actions: VoiceAction[] }>
```
- System prompt from INTEGRATIONS §1.4 with `{petName}`/`{species}` filled; second system message: `"Today's numbers: " + JSON.stringify(compactToday)` where `compactToday` is `{ kcalRemaining, proteinRemaining, petFedGrams, petTargetGrams, topGaps: [{label, pct}] }`.
- `GROK_CHAT_MODEL`, `tools`, `tool_choice: 'auto'`, max 3 rounds, 15 s total budget. If Grok fails entirely → canned reply from `compactToday` (`"You have {kcalRemaining} calories left and you're low on {gap}. Want a suggestion?"`).
- Post-process: strip emojis, cap at 320 chars.

### `routes/voice.ts`
`POST /voice/turn`: parse multipart; if `text` → skip STT; else `stt(audio)`; if STT null → 200 with `transcript: ''`, `reply: "I couldn't hear that — try again or type it."`, `audioBase64: null`. Else `runPetAgent` → `tts(reply, pet.avatar.voice)` → respond `VoiceTurnResponseSchema` with `today: buildToday(userId)`.

## 7. Contingencies (decide at hour one)
| If… | Then… |
|------------------|----------------------------------------|
| Image editing with a reference isn't available | Text-to-image from a Grok-written description of the photo: first call the vision model with the pet photo and the prompt "Describe this pet's species, breed guess, coat colors and markings in one sentence," then generate the three states from that description. Consistency drops; acceptable. |
| Image-to-video unavailable/slow | Drop the video; celebration = Rive confetti only. |
| STT unavailable | Use `expo-speech-recognition` (on-device) for STT; keep Grok for chat + TTS. |
| TTS unavailable | `expo-speech` device voice; still call it "Grok-powered" for the chat brain only. Be accurate in the pitch. |
| Rive referenced assets unsupported | Layered fallback (§4/§5). |

## 8. Acceptance checks
- [ ] Hour-one: INTEGRATIONS §1.3/§1.4 VERIFY notes replaced with confirmed endpoints; scratch outputs committed under `fixtures/`.
- [ ] `POST /avatar/generate` with a real photo → `ready` with three distinct, consistent images in < 3 min; killing the API mid-way and restarting + calling generate again resumes without regenerating finished states.
- [ ] `PetAvatar` visibly changes when `mood` changes (test by logging a big meal); transition is smooth, no flicker.
- [ ] Streak flip triggers confetti (and the video if present) exactly once.
- [ ] Voice: hold, ask "what should I eat", get a spoken reply that names calories remaining and one gap; a `suggest_meal` card appears; "Log it" creates a meal.
- [ ] Voice: "log Biscuit's dinner" → feeding appears on the Pet tab and Home updates.
- [ ] With the API key removed, both flows degrade gracefully (placeholder avatar; text reply + device TTS).
- [ ] `pnpm typecheck` clean.

## 9. Requests to other owners / Implementation notes

## Implementation notes

### Repo state when P4 started

The repo contained only `docs/`, `tasks/` and `packages/shared/src/types.ts`. There was no
`apps/api`, no `apps/mobile`, no root `package.json`, no `pnpm-workspace.yaml`, no `.gitignore`,
and Node/pnpm were not installed on the machine. C0 and C1 had not happened. P4 therefore
bootstrapped the workspace before starting feature work. Everything outside P4's ownership is a
thin placeholder marked `// TODO(P2)` / `// TODO(P3)` — see "Requests to other owners" below.

Node 20.20.2 + pnpm 9.15.9 were installed to `~/.local/node`. Add to your shell:
`export PATH="$HOME/.local/node/bin:$PATH"`.

### Hour-zero verification (done, docs corrected)

`docs/INTEGRATIONS.md` §1.3/§1.4 and `.env.example` now hold values confirmed against live xAI
docs on 2026-09-12. What the plan had wrong:

| Was | Actually |
|---|---|
| `grok-imagine-image` / `grok-imagine-video` | **`grok-imagine-image-2.0`** / **`grok-imagine-video-1.5`** |
| TTS at `/v1/audio/speech` | **`POST /v1/tts`** with `{ text, voice_id, language }`, returns raw MP3 bytes |
| STT at `/v1/audio/transcriptions` | **`POST /v1/stt`**, multipart field `file`, returns `{ text }` |
| `GROK_TTS_MODEL` / `GROK_STT_MODEL` | Neither endpoint takes a model param — both vars removed |
| Voice `Ara` (capitalized) | Voice ids are **lowercase**, default `eve` |

`AvatarInfoSchema.voice` in shared is frozen with default `'Ara'`, which is not a valid
`voice_id`. Rather than propose a shared change, `tts.ts` normalizes with
`voice.trim().toLowerCase()` and falls back to `GROK_DEFAULT_VOICE`. See `test/tts.test.ts`.

Two things the public docs do not pin down, handled defensively in `images.ts`:
- the REST field for multiple edit references (the multi-image-editing page 404s) — it sends
  `images: [...]` and retries once with the documented single `image` shape on a 4xx;
- whether responses carry `url` or base64 — it accepts `data[0].url`, `data[0].b64_json` or a
  top-level `url`, and always returns a `Buffer`.

### What is built

**API** — `services/imagine/{images,video,prompts,pipeline,demo}.ts`, `routes/avatar.ts`,
`services/voice/{stt,tts,tools,agent,suggestMeal,chatClient}.ts`, `routes/voice.ts`.
The pipeline is fire-and-forget, resumable (each state checks its `*PhotoId` and persists
immediately), never throws, and marks `ready` if at least one image exists. The video step is
detached and polls every 5 s for up to 3 min; a small result is re-hosted into `photos` because
Imagine URLs expire.

**Mobile** — `features/avatar/` (`PetAvatar`, `AvatarGenerator`, `CelebrationVideo`,
`ConfettiOverlay`, `PetRive`, `talkingStore`) and `features/voice/` (`TalkButton`, `VoiceSheet`,
`useVoiceTurn`, `CountdownRing`). Exports match P1 §6 exactly.

### Rive: shipped as the layered fallback

`assets/rive/pet.riv` is **not** built. A `.riv` is a compiled binary authored in the Rive
editor, which is a GUI — it cannot be produced from code. `PetAvatar` therefore ships the
layered fallback from INTEGRATIONS §4: the Imagine mood images crossfade over 400 ms with a
Reanimated confetti overlay for celebrations.

The Rive path is written and gated, not missing. To turn it on: author `pet.riv` per §4, drop it
at `apps/mobile/assets/rive/pet.riv`, and flip `HAS_RIVE_ASSET` in
`src/features/avatar/riveConfig.ts`. `PetRive.tsx` already wires `happiness` (pushed each frame
from the Reanimated value), `talking` and the `celebrate` trigger.

### Demo fixtures

`apps/api/fixtures/avatar/{neutral,thriving,drooping}.jpg` are **synthetic SVG mascots**
generated by `scripts/make-fixtures.ts`, not Imagine output — they exist so `DEMO_MODE` and the
mobile placeholder work with no API key. Once `pnpm --filter api scratch:imagine` runs against a
real key it overwrites them with real Imagine images. There is no `celebration.mp4`; until one
exists the celebration is confetti only.

### How to test

```bash
export PATH="$HOME/.local/node/bin:$PATH"
pnpm install && pnpm typecheck && pnpm --filter api test    # 38 tests
pnpm --filter api dev                                        # :3000, on-disk store if MONGODB_URI empty

H='x-dev-user: demo@petplate.app'
curl -XPOST localhost:3000/api/dev/setup -H "$H"             # seeds Biscuit
curl -XPOST localhost:3000/api/avatar/generate -H "$H" -F stylePreset=sticker -F photo=@some-dog.jpg
curl localhost:3000/api/avatar/status -H "$H"
curl -XPOST localhost:3000/api/voice/turn -H "$H" -F 'text=what should I eat for dinner'
```

Once a key is in `.env`, run the hour-one verification: `pnpm --filter api scratch:imagine` and
`pnpm --filter api scratch:voice`. Each reports every capability as OK/FAIL, writes fixtures, and
exits non-zero on any failure. **These have not been run yet — `XAI_API_KEY` is still empty.**

### Verified locally

- `pnpm typecheck` clean across all three packages; `expo export` bundles (1681 modules).
- `DEMO_MODE=true` → `POST /avatar/generate` returns `ready` synchronously, three photos served
  by `GET /api/photos/:id` as `image/jpeg`.
- Score/mood movement: logging a full day of calories plus a 211 g feeding took `avatarState`
  from `drooping` to `thriving` (combined 100) and flipped `streak.todayCounted`.
- Resumability: re-running `POST /avatar/generate` reused the existing photo ids, no regeneration.
- No-key degradation: avatar → three logged failures and `status: failed`, server stays up;
  voice → canned reply citing real numbers with `audioBase64: null` for device-TTS fallback.

### Not verified — needs a key or a device

- Every live xAI call (image gen, edit with 1 and 2 refs, image-to-video, TTS, STT, tool calling).
- Anything requiring a native dev build on a physical device: Rive rendering, the
  `expo-audio` record/playback pipeline, and Auth0. Expo Go cannot run this app (AGENTS.md §8);
  use `npx expo run:ios` / `run:android`.
- Note `mood` differs from `avatarState` late at night by design (ALGORITHMS §3.5 pace logic) —
  do not treat that as a bug during testing.

## Requests to other owners

**P2**
1. `services/grok/client.ts` — P4 wrote a local `services/voice/chatClient.ts`; delete it and
   import yours.
2. `services/usda/fdc.ts` — `suggest_meal` currently returns **Grok's own kcal estimate** with no
   USDA enrichment. Route `ingredientLines` through USDA and replace `kcal` with the computed total.
3. `services/nutrition/gaps.ts` — replace `src/dev/gaps.ts`. Its meal records carry only
   kcal/protein, so micro intake reads as 0 and every micro shows as a gap.
4. `buildToday` — `src/services/today.ts` implements ALGORITHMS §3.1–3.5 inline. Replace with
   `dailyScores` reads; keep the signature, `services/voice/tools.ts` depends on it.
5. `routes/photos.ts` + `POST /meals` — currently stubbed in `src/dev/routes.ts`.
6. `photos.store(userId, kind, buf, contentType)` — P4 needs the 4-arg form; `contentType` may be
   `video/mp4` for re-hosted celebration clips, so do not assume images.

**P3**
1. `services/targets/pet.ts` — replace `src/dev/petTargets.ts` (`adaptivePct` is hard-coded 0).
2. Feeding write path — extract a service function from `routes/pets.ts` and replace
   `src/dev/feedings.ts`, which the voice `log_feeding` tool calls. It does **not** call
   `scoring.recomputeDay` or write a `dailyScores` row.
3. `streak` in `/me/today` is today-only, so the celebration currently triggers off a single-day
   flip. Real `streakLength` from `dailyScores` is needed.

**P1**
1. `src/lib/{api,queries,config}.ts`, `app/_layout.tsx`, `app/index.tsx` and
   `app/onboarding/avatar.tsx` are P4-written placeholders — replace with yours.
2. `api.ts` is generic over the **schema** (`api<S extends z.ZodTypeAny>`), not over its output
   type. Keep that: `z.ZodType<T>` binds `T` to the schema's *input* type, which makes every
   zod `.default()` field wrongly optional at call sites.
3. Call `primeAuthHeaders()` from `features/avatar` once after sign-in with the Auth0 token.
   `GET /api/photos/:id` needs auth, and React Native's `<Image>` needs headers synchronously,
   so `authHeadersSync.ts` caches them. It currently sends the `x-dev-user` dev header.
4. Auth is `DEV_BYPASS_AUTH` + `x-dev-user` end to end right now; no Auth0 anywhere.

**Shared** — no changes needed. The `voice: 'Ara'` default is wrong for the live API but is
handled at the `tts.ts` boundary rather than by unfreezing the schema.
