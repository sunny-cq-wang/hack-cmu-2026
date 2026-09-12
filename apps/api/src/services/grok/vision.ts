import { VisionResultSchema, type VisionResult } from '@petplate/shared';
import { config, isDemo } from '../../config';
import { AppError } from '../../lib/errors';
import { log } from '../../lib/log';
import { canned } from '../demo/canned';
import { grok } from './client';

const SYSTEM = `You are a nutrition vision assistant. Identify each distinct food or drink in the photo.
For each item return: name (specific, e.g. "grilled chicken breast" not "meat"), grams (best estimate of the edible portion visible, using plate size ~27 cm as a reference), confidence 0-1, and a usdaQuery (2-4 words that would match a USDA FoodData Central Foundation or SR Legacy entry, e.g. "chicken breast grilled", "rice brown cooked").
Ignore garnish under 5 g. Merge identical items. If nothing edible is visible return an empty items array.
Output JSON only.`;

const VISION_JSON_SCHEMA = {
  name: 'VisionResult',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            grams: { type: 'number' },
            confidence: { type: 'number' },
            usdaQuery: { type: 'string' },
            estimatedKcal: { type: 'number' },
          },
          required: ['name', 'grams', 'confidence', 'usdaQuery', 'estimatedKcal'],
          additionalProperties: false,
        },
      },
      mealNotes: { type: 'string' },
    },
    required: ['items'],
    additionalProperties: false,
  },
} as const;

/**
 * Vision gets its own budget rather than the 8 s client default: a real plate photo
 * costs several seconds of upload plus inference, and a timeout here throws away the
 * whole analysis. Per-request so other `grok` callers keep their own limits.
 */
const VISION_TIMEOUT_MS = 25_000;

function isTimeout(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = 'name' in err ? String(err.name) : '';
  const status = 'status' in err ? Number(err.status) : 0;
  return name === 'APIConnectionTimeoutError' || name === 'AbortError' || name === 'TimeoutError' || status === 408;
}

function parseContent(content: string | null | undefined): VisionResult {
  if (!content) throw new Error('empty vision content');
  const trimmed = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return VisionResultSchema.parse(JSON.parse(trimmed) as unknown);
}

async function complete(jpeg: Buffer, hint: string | undefined, repair?: string): Promise<string | null> {
  const dataUrl = `data:image/jpeg;base64,${jpeg.toString('base64')}`;
  const userContent: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string; detail: 'high' } }> = [
    { type: 'text', text: hint ? `Meal hint: ${hint}` : 'Analyze this meal.' },
    { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
  ];
  if (repair) userContent.push({ type: 'text', text: repair });

  try {
    const res = await grok.chat.completions.create({
      model: config.GROK_VISION_MODEL,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userContent },
      ],
      // why: xAI structured-output field names differ slightly from OpenAI SDK types
      response_format: {
        type: 'json_schema',
        json_schema: VISION_JSON_SCHEMA,
      } as never,
    }, { timeout: VISION_TIMEOUT_MS });
    return res.choices[0]?.message.content ?? null;
  } catch (err) {
    log.warn({ err }, 'vision json_schema failed, retrying json_object');
    const res = await grok.chat.completions.create({
      model: config.GROK_VISION_MODEL,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
    }, { timeout: VISION_TIMEOUT_MS });
    return res.choices[0]?.message.content ?? null;
  }
}

export async function analyzeMealPhoto(
  jpeg: Buffer,
  hint?: string,
): Promise<{ result: VisionResult; model: string; latencyMs: number; fallback: boolean }> {
  const model = config.GROK_VISION_MODEL;
  const started = Date.now();
  try {
    const content = await complete(jpeg, hint);
    let result: VisionResult;
    try {
      result = parseContent(content);
    } catch (parseErr) {
      const issue = parseErr instanceof Error ? parseErr.message : 'invalid JSON';
      log.warn({ issue }, 'vision zod parse failed, retrying');
      const repaired = await complete(
        jpeg,
        hint,
        `Your previous output was invalid JSON for the schema: ${issue}. Output valid JSON only.`,
      );
      result = parseContent(repaired);
    }
    const latencyMs = Date.now() - started;
    log.info({ model, latencyMs, success: true, items: result.items.length }, 'grok vision');
    return { result, model, latencyMs, fallback: false };
  } catch (err) {
    const latencyMs = Date.now() - started;
    log.warn({ err, model, latencyMs, success: false }, 'grok vision failed');
    if (isDemo) {
      return { result: canned(jpeg), model, latencyMs, fallback: true };
    }
    if (isTimeout(err)) {
      throw new AppError('UPSTREAM_TIMEOUT', 504, 'Grok vision timed out');
    }
    throw new AppError('UPSTREAM_ERROR', 502, 'Grok vision failed');
  }
}
