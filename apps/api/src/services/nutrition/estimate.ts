/**
 * Last-resort nutrition source: ask Grok for a per-100 g estimate when neither USDA
 * FoodData Central nor Nutritionix carries a food the vision model recognised.
 * Results are marked `matchSource: 'grok_estimate'` by the caller so the app can say
 * the number is not from USDA.
 *
 * Macros are included because `humanScore()` awards a protein bonus, so a kcal-only
 * estimate quietly costs the user score. Micronutrients stay 0 — guessed micros would
 * pollute `/nutrition/gaps`.
 */
import { NutrientsSchema, emptyNutrients, type Nutrients } from '@petplate/shared';
import { z } from 'zod';
import { hasXaiKey, isDemo } from '../../config';
import { log } from '../../lib/log';
import { CANNED_ESTIMATE_PER_100G } from '../demo/canned';
import { grokJson } from '../grok/chat';
import { normalizeQueryKey, readFoodCache, writeFoodCache } from '../usda/fdc';

export const GROK_ESTIMATE_DATA_TYPE = 'grok_estimate';

/** Own namespace in the `foods` collection so a guess never shadows a USDA query key. */
const cacheKey = (query: string): string => `grok:${normalizeQueryKey(query)}`;

/** Nothing edible is denser than pure fat (900 kcal/100 g) or heavier than its own weight. */
const MAX_KCAL_PER_100G = 900;
const MAX_GRAMS_PER_100G = 100;

/** Grok chat sits on the meal-save path, so it gets a tighter budget than vision. */
const ESTIMATE_TIMEOUT_MS = 6_000;

const RawEstimateSchema = z.object({
  kcal: z.number(),
  proteinG: z.number(),
  fatG: z.number(),
  carbsG: z.number(),
  fiberG: z.number(),
});
export type RawEstimate = z.infer<typeof RawEstimateSchema>;

const ESTIMATE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    kcal: { type: 'number' },
    proteinG: { type: 'number' },
    fatG: { type: 'number' },
    carbsG: { type: 'number' },
    fiberG: { type: 'number' },
  },
  required: ['kcal', 'proteinG', 'fatG', 'carbsG', 'fiberG'],
  additionalProperties: false,
} as const;

const SYSTEM = `You are a nutrition database. Given a food or drink name, return its nutrition per 100 g of edible portion, prepared the way the name describes (assume cooked if the name says cooked).
Use kcal, not kJ. Protein, fat, carbohydrate and fiber are in grams per 100 g. Carbohydrate is total carbohydrate including fiber.
Be conservative and typical: give the value you would find in a national food composition table, not a best or worst case.
Output JSON only.`;

const clamp = (value: number, max: number): number => Math.min(Math.max(value, 0), max);

/**
 * Turns a raw model answer into nutrients we are willing to store, or `null` when the
 * answer is not usable. `kcal` wins any disagreement with the 4/4/9 macro sum: it is
 * the number the user is shown and the one scoring runs on.
 */
export function sanitizePer100g(raw: RawEstimate): Nutrients | null {
  if (!Number.isFinite(raw.kcal) || raw.kcal <= 0 || raw.kcal > MAX_KCAL_PER_100G) {
    return null;
  }
  const proteinG = clamp(raw.proteinG, MAX_GRAMS_PER_100G);
  const fatG = clamp(raw.fatG, MAX_GRAMS_PER_100G);
  const carbsG = clamp(raw.carbsG, MAX_GRAMS_PER_100G);
  const out = NutrientsSchema.parse({
    ...emptyNutrients(),
    kcal: raw.kcal,
    proteinG,
    fatG,
    carbsG,
    // Fiber is part of total carbohydrate, so it cannot exceed it.
    fiberG: clamp(raw.fiberG, carbsG),
  });

  const fromMacros = 4 * proteinG + 4 * carbsG + 9 * fatG;
  if (fromMacros > 0 && Math.abs(fromMacros - raw.kcal) / raw.kcal > 0.3) {
    log.warn({ kcal: raw.kcal, fromMacros }, 'grok estimate macros disagree with kcal, keeping kcal');
  }
  return out;
}

async function askGrok(query: string): Promise<Nutrients | null> {
  const started = Date.now();
  try {
    const raw = await grokJson({
      system: SYSTEM,
      user: JSON.stringify({ food: query }),
      schema: RawEstimateSchema,
      timeoutMs: ESTIMATE_TIMEOUT_MS,
      jsonSchemaName: 'NutritionEstimate',
      jsonSchema: ESTIMATE_JSON_SCHEMA,
    });
    const per100g = sanitizePer100g(raw);
    log.info(
      { query, latencyMs: Date.now() - started, success: per100g !== null, kcal: raw.kcal },
      'grok nutrition estimate',
    );
    return per100g;
  } catch (err) {
    log.warn({ err, query, latencyMs: Date.now() - started, success: false }, 'grok nutrition estimate failed');
    if (isDemo) return CANNED_ESTIMATE_PER_100G;
    return null;
  }
}

/**
 * Per-100 g nutrients for `query`, or `null` when Grok is unavailable or its answer is
 * implausible. Cached in the same `foods` collection as USDA lookups, so repeating a
 * food is free and editing grams re-scales instead of re-asking.
 */
export async function estimatePer100g(query: string): Promise<Nutrients | null> {
  const normalized = normalizeQueryKey(query);
  if (!normalized) return null;

  const key = cacheKey(normalized);
  const cached = await readFoodCache(key);
  if (cached) return cached.per100g;

  // Without a key there is nothing to ask; `enrichOne` falls back to the vision kcal,
  // which is a better per-item guess than any generic stand-in.
  if (!hasXaiKey()) return null;

  const per100g = await askGrok(normalized);
  if (!per100g) return null;

  await writeFoodCache(key, {
    fdcId: 0,
    description: normalized,
    per100g,
    dataType: GROK_ESTIMATE_DATA_TYPE,
  });
  return per100g;
}
