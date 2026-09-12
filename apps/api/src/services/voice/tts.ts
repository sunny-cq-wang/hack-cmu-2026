/**
 * Grok text-to-speech. Verified 2026-09-12 (INTEGRATIONS §1.4):
 *   POST /v1/tts  { text, voice_id, language } -> raw audio bytes (MP3)
 *
 * Returns null on any failure so the caller can fall back to device TTS.
 */
import { config, hasXaiKey } from '../../config';
import { fetchWithTimeout, readErrorBody } from '../../lib/http';
import { log } from '../../lib/log';

const TTS_TIMEOUT_MS = 10_000;

export interface TtsResult {
  buffer: Buffer;
  mime: string;
}

/**
 * xAI voice ids are lowercase. `AvatarInfoSchema.voice` is frozen with default
 * 'Ara', so normalize here rather than editing shared.
 */
export const normalizeVoice = (voice: string | null | undefined): string => {
  const cleaned = (voice ?? '').trim().toLowerCase();
  return cleaned.length > 0 ? cleaned : config.GROK_DEFAULT_VOICE.toLowerCase();
};

export async function tts(text: string, voice?: string): Promise<TtsResult | null> {
  if (!hasXaiKey()) {
    log.warn('tts skipped: XAI_API_KEY missing');
    return null;
  }
  const body = text.trim();
  if (!body) return null;

  const voiceId = normalizeVoice(voice);
  const startedAt = Date.now();
  try {
    const res = await fetchWithTimeout(
      `${config.XAI_BASE_URL}/tts`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.XAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: body, voice_id: voiceId, language: 'en' }),
      },
      TTS_TIMEOUT_MS,
    );

    if (!res.ok) {
      log.warn(
        { ext: 'grok.tts', ms: Date.now() - startedAt, ok: false, status: res.status, voiceId, body: await readErrorBody(res) },
        'tts failed',
      );
      return null;
    }

    const mime = res.headers.get('content-type')?.split(';')[0]?.trim() || 'audio/mpeg';
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength === 0) return null;
    log.info({ ext: 'grok.tts', ms: Date.now() - startedAt, ok: true, bytes: buffer.byteLength, voiceId }, 'tts ok');
    return { buffer, mime };
  } catch (err) {
    log.warn({ ext: 'grok.tts', ms: Date.now() - startedAt, ok: false, err: (err as Error).message }, 'tts failed');
    return null;
  }
}
