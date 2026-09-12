/**
 * Grok Imagine image generation + editing.
 *
 * Endpoints verified 2026-09-12 (INTEGRATIONS §1.3):
 *   POST /v1/images/generations  { model, prompt }
 *   POST /v1/images/edits        { model, prompt, image: { url, type: 'image_url' } }
 *
 * Callers only ever see `Promise<Buffer>` holding a JPEG ≤ 300 KB.
 */
import { config, hasXaiKey } from '../../config';
import { fetchWithTimeout, readErrorBody, upstreamError } from '../../lib/http';
import { log } from '../../lib/log';
import { AppError } from '../../lib/errors';
import { normalizeJpeg } from '../photos';

const IMAGE_TIMEOUT_MS = 60_000;
const AVATAR_MAX_SIDE = 768;

export const MAX_REFERENCE_IMAGES = 5;

const authHeaders = (): Record<string, string> => ({
  Authorization: `Bearer ${config.XAI_API_KEY}`,
  'Content-Type': 'application/json',
});

export const toDataUri = (buf: Buffer, mime = 'image/jpeg'): string =>
  `data:${mime};base64,${buf.toString('base64')}`;

interface ImagineImageResponse {
  data?: { url?: string; b64_json?: string }[];
  url?: string;
  b64_json?: string;
}

/**
 * The docs show `url` in some samples and base64 in others, so accept both.
 */
async function extractImage(res: Response, label: string): Promise<Buffer> {
  const payload = (await res.json()) as ImagineImageResponse;
  const first = payload.data?.[0];
  const b64 = first?.b64_json ?? payload.b64_json;
  if (b64) return Buffer.from(b64, 'base64');

  const url = first?.url ?? payload.url;
  if (!url) throw new AppError('UPSTREAM_ERROR', `${label} returned neither a url nor base64 data`);

  const fetched = await fetchWithTimeout(url, { method: 'GET' }, IMAGE_TIMEOUT_MS);
  if (!fetched.ok) throw upstreamError(`${label} asset download`, fetched.status, await readErrorBody(fetched));
  return Buffer.from(await fetched.arrayBuffer());
}

async function finish(raw: Buffer, label: string, prompt: string, startedAt: number): Promise<Buffer> {
  const jpeg = await normalizeJpeg(raw, AVATAR_MAX_SIDE);
  log.info(
    { ext: label, ms: Date.now() - startedAt, ok: true, bytes: jpeg.byteLength, prompt: prompt.slice(0, 120) },
    `${label} ok`,
  );
  return jpeg;
}

function requireKey(label: string): void {
  if (!hasXaiKey()) throw new AppError('UPSTREAM_ERROR', `${label} needs XAI_API_KEY`);
}

export async function generateImage(prompt: string): Promise<Buffer> {
  requireKey('imagine.generateImage');
  const startedAt = Date.now();
  const res = await fetchWithTimeout(
    `${config.XAI_BASE_URL}/images/generations`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ model: config.GROK_IMAGE_MODEL, prompt, n: 1 }),
    },
    IMAGE_TIMEOUT_MS,
  );
  if (!res.ok) {
    const body = await readErrorBody(res);
    log.warn({ ext: 'imagine.generateImage', ms: Date.now() - startedAt, ok: false, status: res.status, body }, 'generateImage failed');
    throw upstreamError('imagine.generateImage', res.status, body);
  }
  return finish(await extractImage(res, 'imagine.generateImage'), 'imagine.generateImage', prompt, startedAt);
}

/**
 * Edit with up to 5 references. The REST field name for multiple references is
 * not documented (the multi-image-editing page 404s), so try the plural `images`
 * array first and fall back to the documented single-image shape on a 4xx.
 */
export async function editImage(prompt: string, refs: Buffer[]): Promise<Buffer> {
  requireKey('imagine.editImage');
  if (refs.length === 0) throw new AppError('VALIDATION_ERROR', 'editImage needs at least one reference image');

  const used = refs.slice(0, MAX_REFERENCE_IMAGES);
  const uris = used.map((buf) => toDataUri(buf));
  const startedAt = Date.now();

  const post = (body: unknown): Promise<Response> =>
    fetchWithTimeout(
      `${config.XAI_BASE_URL}/images/edits`,
      { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) },
      IMAGE_TIMEOUT_MS,
    );

  const base = { model: config.GROK_IMAGE_MODEL, prompt, n: 1 };
  const singleShape = { ...base, image: { url: uris[0], type: 'image_url' } };

  let res =
    uris.length > 1
      ? await post({ ...base, images: uris.map((url) => ({ url, type: 'image_url' })) })
      : await post(singleShape);

  if (!res.ok && uris.length > 1 && res.status >= 400 && res.status < 500) {
    log.warn(
      { ext: 'imagine.editImage', status: res.status, refs: uris.length },
      'multi-reference edit rejected — retrying with the single-image shape',
    );
    res = await post(singleShape);
  }

  if (!res.ok) {
    const body = await readErrorBody(res);
    log.warn({ ext: 'imagine.editImage', ms: Date.now() - startedAt, ok: false, status: res.status, body }, 'editImage failed');
    throw upstreamError('imagine.editImage', res.status, body);
  }
  return finish(await extractImage(res, 'imagine.editImage'), 'imagine.editImage', prompt, startedAt);
}
