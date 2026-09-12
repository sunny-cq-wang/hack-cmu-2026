import { emptyNutrients, type MealItem, type Nutrients } from '@petplate/shared';
import { isDemo } from '../../config';
import { log } from '../../lib/log';
import { CANNED_ESTIMATE_PER_100G } from '../demo/canned';
import { lookupFood, lookupFoodByFdcId, scaleNutrients, type FdcLookup } from '../usda/fdc';
import { lookupNutritionix } from '../usda/nutritionix';
import { estimatePer100g } from './estimate';

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

/**
 * Nothing priced this item, so fall back to the vision model's own kcal guess. In
 * DEMO_MODE, an item that never went through vision (the `POST /meals` save path sends
 * only name and grams) gets a canned per-100 g rather than logging as 0 kcal.
 */
function fallbackNutrients(item: EnrichInput): Nutrients {
  if (item.estimatedKcal) return { ...emptyNutrients(), kcal: item.estimatedKcal };
  if (isDemo) return scaleNutrients(CANNED_ESTIMATE_PER_100G, item.grams);
  return emptyNutrients();
}

function grokEstimate(item: EnrichInput): MealItem {
  return {
    name: item.name,
    grams: item.grams,
    nutrients: fallbackNutrients(item),
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
  if (!lookup) {
    // Neither database carries this food: let Grok price it, marked as an estimate.
    const per100g = await estimatePer100g(item.usdaQuery ?? item.name);
    if (per100g) {
      return {
        name: item.name,
        grams: item.grams,
        nutrients: scaleNutrients(per100g, item.grams),
        fdcId: null,
        matchSource: 'grok_estimate',
        confidence: item.confidence ?? 1,
      };
    }
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
