/**
 * Voice endpoint — API_CONTRACTS.md §6. Owner: P4.
 */
import { Hono } from 'hono';
import { VoiceTurnResponseSchema } from '@petplate/shared';
import { store as db } from '../db/connect.js';
import type { AuthVars } from '../lib/auth.js';
import { requireAuth } from '../lib/auth.js';
import { AppError } from '../lib/errors.js';
import { buildToday } from '../services/today.js';
import { runPetAgent } from '../services/voice/agent.js';
import { stt } from '../services/voice/stt.js';
import { tts } from '../services/voice/tts.js';

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
    transcript = (await stt(bytes, audio.type || 'audio/m4a')) ?? '';
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
