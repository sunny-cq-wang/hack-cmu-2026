/**
 * Grok speech-to-text. Verified 2026-09-12 (INTEGRATIONS §1.4):
 *   POST /v1/stt  multipart field `file` -> { text }
 *
 * `file` must be the last multipart field (xAI docs). Returns null on any
 * failure so the voice route can degrade to "I couldn't hear that".
 */
import { config, hasXaiKey } from '../../config';
import { fetchWithTimeout, readErrorBody } from '../../lib/http';
import { log } from '../../lib/log';

const STT_TIMEOUT_MS = 10_000;

const EXTENSION_BY_MIME: Record<string, string> = {
  'audio/m4a': 'm4a',
  'audio/mp4': 'mp4',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
};

function sniffContainer(audio: Buffer): { mime: string; ext: string } | null {
  if (audio.byteLength >= 12 && audio.subarray(0, 4).toString('ascii') === 'RIFF') {
    return { mime: 'audio/wav', ext: 'wav' };
  }
  if (audio.byteLength >= 12 && audio.subarray(4, 8).toString('ascii') === 'ftyp') {
    return { mime: 'audio/mp4', ext: 'm4a' };
  }
  if (audio.byteLength >= 3 && audio.subarray(0, 3).toString('ascii') === 'ID3') {
    return { mime: 'audio/mpeg', ext: 'mp3' };
  }
  if (audio.byteLength >= 2 && audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0) {
    return { mime: 'audio/mpeg', ext: 'mp3' };
  }
  return null;
}

export async function stt(audio: Buffer, mime = 'audio/m4a'): Promise<string | null> {
  if (!hasXaiKey()) {
    log.warn('stt skipped: XAI_API_KEY missing');
    return null;
  }
  if (audio.byteLength === 0) return null;

  const sniffed = sniffContainer(audio);
  const resolvedMime = sniffed?.mime ?? mime;
  const ext = sniffed?.ext ?? EXTENSION_BY_MIME[resolvedMime] ?? 'm4a';

  const startedAt = Date.now();
  try {
    const form = new FormData();
    // Option fields must precede `file` or xAI may ignore them.
    form.append('language', 'en');
    form.append('format', 'true');
    // Default VAD (0.5) was dropping short/quiet phone clips as non-speech.
    form.append('vad_threshold', '0');
    form.append('file', new Blob([new Uint8Array(audio)], { type: resolvedMime }), `recording.${ext}`);

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

    const payload = (await res.json()) as { text?: string; transcript?: string; duration?: number };
    const text = (payload.text ?? payload.transcript ?? '').trim();
    log.info(
      {
        ext: 'grok.stt',
        ms: Date.now() - startedAt,
        ok: true,
        chars: text.length,
        bytes: audio.byteLength,
        mime: resolvedMime,
        duration: payload.duration ?? null,
      },
      'stt ok',
    );
    return text || null;
  } catch (err) {
    log.warn({ ext: 'grok.stt', ms: Date.now() - startedAt, ok: false, err: (err as Error).message }, 'stt failed');
    return null;
  }
}
