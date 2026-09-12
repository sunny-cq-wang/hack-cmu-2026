/**
 * Voice endpoint — API_CONTRACTS.md §6. Owner: P4.
 */
import { Hono } from 'hono';
import { VoiceTurnResponseSchema } from '@petplate/shared';
import { z } from 'zod';
import { store as db } from '../db/connect';
import type { AuthVars } from '../lib/auth';
import { requireAuth } from '../lib/auth';
import { AppError } from '../lib/errors';
import { log } from '../lib/log';
import { buildToday } from '../services/today';
import { postProcess, runPetAgent } from '../services/voice/agent';
import { stt } from '../services/voice/stt';
import { tts } from '../services/voice/tts';

const SpeakRequestSchema = z.object({
  text: z.string().min(1).max(500),
});

export const voiceRoutes = new Hono<AuthVars>();

const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const UNHEARD_REPLY = "I couldn't hear that — try again or type it.";

voiceRoutes.post('/turn', requireAuth, async (c) => {
  const body = await c.req.parseBody();
  const typed = typeof body['text'] === 'string' ? body['text'].trim() : '';
  const audio = body['audio'];

  let transcript = typed;
  if (!transcript) {
    if (!(audio instanceof File)) throw new AppError('VALIDATION_ERROR', 'Send either audio or text');
    const bytes = Buffer.from(await audio.arrayBuffer());
    if (bytes.byteLength > MAX_AUDIO_BYTES) throw new AppError('VALIDATION_ERROR', 'Audio clip is too large');
    log.info({ bytes: bytes.byteLength, mime: audio.type || 'unknown', name: audio.name }, 'voice clip received');
    transcript = (await stt(bytes, audio.type || 'audio/mp4')) ?? '';
  }

  // STT failure is a 200 with an empty transcript so the sheet can show guidance.
  if (!transcript) {
    return c.json(
      VoiceTurnResponseSchema.parse({
        transcript: '',
        reply: UNHEARD_REPLY,
        audioBase64: null,
        audioMime: null,
        actions: [],
        today: await buildToday(c.var.userId),
      }),
    );
  }

  const { reply, actions } = await runPetAgent(c.var.userId, transcript);

  const pet = await db.findPetByUserId(c.var.userId);
  const spoken = await tts(reply, pet?.avatar.voice);

  return c.json(
    VoiceTurnResponseSchema.parse({
      transcript,
      reply,
      audioBase64: spoken ? spoken.buffer.toString('base64') : null,
      audioMime: spoken ? spoken.mime : null,
      actions,
      // Reflects a voice-logged feeding (API_CONTRACTS §6).
      today: await buildToday(c.var.userId),
    }),
  );
});

/** TTS only — used when the user taps the pet. Slim body so today-schema drift cannot 500. */
voiceRoutes.post('/speak', requireAuth, async (c) => {
  const parsed = SpeakRequestSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new AppError('VALIDATION_ERROR', 'Send a line of text to speak');

  const text = postProcess(parsed.data.text);
  if (!text) throw new AppError('VALIDATION_ERROR', 'Nothing to say');

  const pet = await db.findPetByUserId(c.var.userId);
  const spoken = await tts(text, pet?.avatar.voice);
  log.info({ bytes: spoken?.buffer.byteLength ?? 0, voice: pet?.avatar.voice ?? null }, 'tap speak');

  return c.json({
    reply: text,
    audioBase64: spoken ? spoken.buffer.toString('base64') : null,
    audioMime: spoken ? spoken.mime : null,
  });
});
