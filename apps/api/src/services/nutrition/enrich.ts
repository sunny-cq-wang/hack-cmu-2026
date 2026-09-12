import { emptyNutrients, type MealItem, type Nutrients } from '@petplate/shared';
import { log } from '../../lib/log';
import { lookupFood, lookupFoodByFdcId, scaleNutrients, type FdcLookup } from '../usda/fdc';
import { lookupNutritionix } from '../usda/nutritionix';

export function sumNutrients(list: Nutrients[]): Nutrients {
  const out = emptyNutrients();
  const keys = Object.keys(out) as (keyof Nutrients)[];
  for (const nutrients of list) {
    for (const key of keys) {
      out[key] += nutrients[key] ?? 0;
    }
  }
  return out;
}

export type EnrichInput = {
  name: string;
  grams: number;
  usdaQuery?: string;
  fdcId?: number | null;
  estimatedKcal?: number;
  confidence?: number;
};

function grokEstimate(item: EnrichInput): MealItem {
  return {
    name: item.name,
    grams: item.grams,
    nutrients: { ...emptyNutrients(), kcal: item.estimatedKcal ?? 0 },
    fdcId: item.fdcId ?? null,
    matchSource: 'grok_estimate',
    confidence: item.confidence ?? 1,
  };
}

async function enrichOne(item: EnrichInput): Promise<MealItem> {
  let lookup: FdcLookup | null = null;
  let matchSource: MealItem['matchSource'] = 'usda';

  if (item.fdcId) {
    lookup = await lookupFoodByFdcId(item.fdcId);
  }
  if (!lookup) {
    lookup = await lookupFood(item.usdaQuery ?? item.name);
  }
  if (!lookup) {
    lookup = await lookupNutritionix(item.usdaQuery ?? item.name, item.grams);
    if (lookup) matchSource = 'nutritionix';
  }
  if (!lookup) return grokEstimate(item);

  return {
    name: item.name,
    grams: item.grams,
    nutrients: scaleNutrients(lookup.per100g, item.grams),
    fdcId: lookup.fdcId || null,
    matchSource,
    confidence: item.confidence ?? 1,
  };
}

export async function enrichItems(items: EnrichInput[]): Promise<MealItem[]> {
  const settled = await Promise.allSettled(items.map((item) => enrichOne(item)));
  return settled.map((result, index) => {
    const item = items[index] ?? { name: 'unknown', grams: 0 };
    if (result.status === 'fulfilled') return result.value;
    log.warn({ err: result.reason, name: item.name }, 'enrich lookup failed, using grok_estimate');
    return grokEstimate(item);
  });
}
