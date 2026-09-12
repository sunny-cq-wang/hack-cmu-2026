/**
 * Grok Imagine image-to-video. Async by contract: start, then poll.
 *
 * Verified 2026-09-12 (INTEGRATIONS §1.3):
 *   POST /v1/videos/generations  { model, prompt, image: { url }, duration } -> { request_id }
 *   GET  /v1/videos/{request_id} -> { status: 'pending'|'done'|'failed'|'expired', video: { url } }
 */
import { config, hasXaiKey } from '../../config.js';
import { fetchWithTimeout, readErrorBody, upstreamError } from '../../lib/http.js';
import { log } from '../../lib/log.js';
import { AppError } from '../../lib/errors.js';
import { toDataUri } from './images.js';

const START_TIMEOUT_MS = 30_000;
const POLL_TIMEOUT_MS = 15_000;

export type VideoStatus = 'pending' | 'done' | 'failed';

export interface VideoPollResult {
  status: VideoStatus;
  url?: string;
}

export async function startImageToVideo(
  prompt: string,
  ref: Buffer,
  seconds: number,
): Promise<{ requestId: string }> {
  if (!hasXaiKey()) throw new AppError('UPSTREAM_ERROR', 'imagine.video needs XAI_API_KEY');
  const startedAt = Date.now();
  const res = await fetchWithTimeout(
    `${config.XAI_BASE_URL}/videos/generations`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.XAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.GROK_VIDEO_MODEL,
        prompt,
        image: { url: toDataUri(ref) },
        duration: seconds,
        resolution: '720p',
      }),
    },
    START_TIMEOUT_MS,
  );

  if (!res.ok) {
    const body = await readErrorBody(res);
    log.warn({ ext: 'imagine.startVideo', ms: Date.now() - startedAt, ok: false, status: res.status, body }, 'startImageToVideo failed');
    throw upstreamError('imagine.startVideo', res.status, body);
  }

  const payload = (await res.json()) as { request_id?: string; id?: string };
  const requestId = payload.request_id ?? payload.id;
  if (!requestId) throw new AppError('UPSTREAM_ERROR', 'Video request returned no request_id');
  log.info({ ext: 'imagine.startVideo', ms: Date.now() - startedAt, ok: true, requestId }, 'startImageToVideo ok');
  return { requestId };
}

export async function pollVideo(requestId: string): Promise<VideoPollResult> {
  if (!hasXaiKey()) return { status: 'failed' };
  const res = await fetchWithTimeout(
    `${config.XAI_BASE_URL}/videos/${requestId}`,
    { method: 'GET', headers: { Authorization: `Bearer ${config.XAI_API_KEY}` } },
    POLL_TIMEOUT_MS,
  );
  if (!res.ok) {
    log.warn({ ext: 'imagine.pollVideo', status: res.status, requestId }, 'pollVideo failed');
    return { status: 'failed' };
  }

  const payload = (await res.json()) as {
    status?: string;
    video?: { url?: string };
    url?: string;
  };
  const raw = payload.status ?? 'pending';
  // 'expired' is terminal like 'failed'.
  if (raw === 'failed' || raw === 'expired') return { status: 'failed' };
  if (raw !== 'done') return { status: 'pending' };

  const url = payload.video?.url ?? payload.url;
  return url ? { status: 'done', url } : { status: 'failed' };
}
