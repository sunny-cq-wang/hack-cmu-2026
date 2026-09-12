/**
 * Grok speech-to-text. Verified 2026-09-12 (INTEGRATIONS §1.4):
 *   POST /v1/stt  multipart field `file` -> { text }
 *
 * Returns null on any failure (logged, never thrown) so `agent.ts` can degrade.
 */
import { config, hasXaiKey } from '../../config';
import { fetchWithTimeout, readErrorBody } from '../../lib/http';
import { log } from '../../lib/log';

const STT_TIMEOUT_MS = 10_000;

const EXTENSION_BY_MIME: Record<string, string> = {
  'audio/m4a': 'm4a',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
};

export async function stt(audio: Buffer, mime = 'audio/m4a'): Promise<string | null> {
  if (!hasXaiKey()) {
    log.warn('stt skipped: XAI_API_KEY missing');
    return null;
  }
  if (audio.byteLength === 0) return null;

  const startedAt = Date.now();
  try {
    const form = new FormData();
    const ext = EXTENSION_BY_MIME[mime] ?? 'm4a';
    form.append('file', new Blob([new Uint8Array(audio)], { type: mime }), `recording.${ext}`);

    const res = await fetchWithTimeout(
      `${config.XAI_BASE_URL}/stt`,
      { method: 'POST', headers: { Authorization: `Bearer ${config.XAI_API_KEY}` }, body: form },
      STT_TIMEOUT_MS,
    );

    if (!res.ok) {
      log.warn(
        { ext: 'grok.stt', ms: Date.now() - startedAt, ok: false, status: res.status, body: await readErrorBody(res) },
        'stt failed',
      );
      return null;
    }

    const payload = (await res.json()) as { text?: string };
    const text = payload.text?.trim() ?? '';
    log.info({ ext: 'grok.stt', ms: Date.now() - startedAt, ok: true, chars: text.length }, 'stt ok');
    return text || null;
  } catch (err) {
    log.warn({ ext: 'grok.stt', ms: Date.now() - startedAt, ok: false, err: (err as Error).message }, 'stt failed');
    return null;
  }
}
