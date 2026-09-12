import { NUTRIENT_KEYS, NutrientsSchema, emptyNutrients, type Nutrients } from '@petplate/shared';
import { config } from '../../config';
import { FoodModel } from '../../db/models';
import { fetchWithTimeout } from '../../lib/http';
import { log } from '../../lib/log';
import { NUTRIENT_ID_TO_KEY } from './nutrientIds';

const SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';
const FOOD_URL = 'https://api.nal.usda.gov/fdc/v1/food';

export type FdcLookup = {
  fdcId: number;
  description: string;
  per100g: Nutrients;
  dataType: string;
};

type FdcNutrient = {
  nutrientId?: number;
  nutrient?: { id?: number };
  value?: number;
  amount?: number;
};

type FdcFood = {
  fdcId: number;
  description: string;
  dataType?: string;
  foodNutrients?: FdcNutrient[];
};

let hourStartedAt = Date.now();
let callsThisHour = 0;

function allowUsdaCall(): boolean {
  if (Date.now() - hourStartedAt > 60 * 60 * 1000) {
    hourStartedAt = Date.now();
    callsThisHour = 0;
  }
  if (callsThisHour >= 900) {
    log.warn({ callsThisHour }, 'USDA hourly guard hit, skipping');
    return false;
  }
  callsThisHour += 1;
  return true;
}

export function normalizeQueryKey(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function scaleNutrients(per100g: Nutrients, grams: number): Nutrients {
  const out = emptyNutrients();
  for (const key of NUTRIENT_KEYS) {
    out[key] = ((per100g[key] ?? 0) * grams) / 100;
  }
  return NutrientsSchema.parse(out);
}

export function nutrientsFromFdc(foodNutrients: FdcNutrient[] | undefined): Nutrients {
  const out = emptyNutrients();
  for (const entry of foodNutrients ?? []) {
    const id = entry.nutrientId ?? entry.nutrient?.id;
    const value = entry.value ?? entry.amount ?? 0;
    if (id === undefined) continue;
    const key = NUTRIENT_ID_TO_KEY[id];
    if (key) out[key] = value;
  }
  return NutrientsSchema.parse(out);
}

function pickFood(query: string, foods: FdcFood[]): FdcFood | null {
  if (foods.length === 0) return null;
  const tokens = normalizeQueryKey(query).split(' ').filter(Boolean);
  const matches = foods.filter((food) => {
    const desc = food.description.toLowerCase();
    return tokens.every((token) => desc.includes(token));
  });
  const pool = matches.length > 0 ? matches : foods;
  return pool.find((food) => food.dataType === 'Foundation') ?? pool[0] ?? null;
}

async function usdaGet(url: string): Promise<unknown> {
  const started = Date.now();
  try {
    const res = await fetchWithTimeout(url, { method: 'GET' }, 4000);
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      log.warn({ url, status: res.status, latencyMs, success: false }, 'usda request');
      return null;
    }
    log.info({ url, status: res.status, latencyMs, success: true }, 'usda request');
    return (await res.json()) as unknown;
  } catch (err) {
    log.warn({ err, url, latencyMs: Date.now() - started, success: false }, 'usda request failed');
    return null;
  }
}

async function searchUsda(query: string): Promise<FdcFood[]> {
  if (!allowUsdaCall()) return [];
  const url = `${SEARCH_URL}?api_key=${encodeURIComponent(config.USDA_API_KEY)}&query=${encodeURIComponent(query)}&dataType=Foundation,SR%20Legacy&pageSize=5`;
  const json = await usdaGet(url);
  if (!json || typeof json !== 'object' || !('foods' in json)) return [];
  const foods = (json as { foods?: FdcFood[] }).foods;
  return Array.isArray(foods) ? foods : [];
}

async function writeCache(queryKey: string, lookup: FdcLookup): Promise<void> {
  await FoodModel.findOneAndUpdate(
    { queryKey },
    {
      $set: {
        queryKey,
        fdcId: lookup.fdcId,
        description: lookup.description,
        per100g: lookup.per100g,
        dataType: lookup.dataType,
      },
    },
    { upsert: true },
  );
}

function fromCacheDoc(doc: { fdcId: number; description: string; per100g: Nutrients; dataType: string }): FdcLookup {
  return {
    fdcId: doc.fdcId,
    description: doc.description,
    per100g: NutrientsSchema.parse(doc.per100g),
    dataType: doc.dataType,
  };
}

export async function lookupFood(query: string): Promise<FdcLookup | null> {
  const queryKey = normalizeQueryKey(query);
  if (!queryKey) return null;
  const cached = await FoodModel.findOne({ queryKey });
  if (cached) return fromCacheDoc(cached);

  let foods = await searchUsda(queryKey);
  let picked = pickFood(queryKey, foods);
  if (!picked) {
    const short = queryKey.split(' ').slice(0, 2).join(' ');
    if (short && short !== queryKey) {
      foods = await searchUsda(short);
      picked = pickFood(short, foods);
    }
  }
  if (!picked) return null;

  let per100g = nutrientsFromFdc(picked.foodNutrients);
  if (!picked.foodNutrients?.length) {
    const byId = await lookupFoodByFdcId(picked.fdcId);
    if (byId) per100g = byId.per100g;
  }
  const lookup: FdcLookup = {
    fdcId: picked.fdcId,
    description: picked.description,
    per100g,
    dataType: picked.dataType ?? 'unknown',
  };
  await writeCache(queryKey, lookup);
  await writeCache(`fdc:${lookup.fdcId}`, lookup);
  return lookup;
}

export async function lookupFoodByFdcId(fdcId: number): Promise<FdcLookup | null> {
  const queryKey = `fdc:${fdcId}`;
  const cached = await FoodModel.findOne({ queryKey });
  if (cached) return fromCacheDoc(cached);
  if (!allowUsdaCall()) return null;
  const url = `${FOOD_URL}/${fdcId}?api_key=${encodeURIComponent(config.USDA_API_KEY)}`;
  const json = await usdaGet(url);
  if (!json || typeof json !== 'object') return null;
  const food = json as FdcFood;
  if (!food.fdcId) return null;
  const lookup: FdcLookup = {
    fdcId: food.fdcId,
    description: food.description ?? `fdc ${fdcId}`,
    per100g: nutrientsFromFdc(food.foodNutrients),
    dataType: food.dataType ?? 'unknown',
  };
  await writeCache(queryKey, lookup);
  return lookup;
}
