import { emptyNutrients, type Nutrients } from '@petplate/shared';
import { config } from '../../config';
import { fetchWithTimeout } from '../../lib/http';
import { log } from '../../lib/log';
import type { FdcLookup } from './fdc';

/** Nutritionix attr_id uses USDA SR numbers, not FDC ids. */
const NIX_ATTR: Record<number, keyof Nutrients> = {
  208: 'kcal',
  203: 'proteinG',
  204: 'fatG',
  205: 'carbsG',
  291: 'fiberG',
  301: 'calciumMg',
  303: 'ironMg',
  304: 'magnesiumMg',
  306: 'potassiumMg',
  307: 'sodiumMg',
  309: 'zincMg',
  401: 'vitaminCMg',
  324: 'vitaminDUg',
  320: 'vitaminARaeUg',
  417: 'folateUg',
  418: 'vitaminB12Ug',
};

export async function lookupNutritionix(query: string, grams: number): Promise<FdcLookup | null> {
  if (!config.NUTRITIONIX_APP_ID || !config.NUTRITIONIX_APP_KEY) return null;
  const started = Date.now();
  try {
    const res = await fetchWithTimeout(
      'https://trackapi.nutritionix.com/v2/natural/nutrients',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-app-id': config.NUTRITIONIX_APP_ID,
          'x-app-key': config.NUTRITIONIX_APP_KEY,
        },
        body: JSON.stringify({ query: `${grams} g ${query}` }),
      },
      4000,
    );
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      log.warn({ status: res.status, latencyMs, success: false }, 'nutritionix request');
      return null;
    }
    log.info({ latencyMs, success: true }, 'nutritionix request');
    const json = (await res.json()) as {
      foods?: Array<{
        serving_weight_grams?: number;
        full_nutrients?: Array<{ attr_id: number; value: number }>;
        food_name?: string;
        nix_item_id?: string;
      }>;
    };
    const food = json.foods?.[0];
    if (!food) return null;
    const serving = food.serving_weight_grams || grams || 100;
    const mapped = emptyNutrients();
    for (const n of food.full_nutrients ?? []) {
      const key = NIX_ATTR[n.attr_id];
      if (key) mapped[key] = n.value;
    }
    // Nutritionix values are for the serving, convert to per 100 g.
    const per100g = emptyNutrients();
    (Object.keys(mapped) as (keyof Nutrients)[]).forEach((key) => {
      per100g[key] = (mapped[key] * 100) / serving;
    });
    return {
      fdcId: 0,
      description: food.food_name ?? query,
      per100g,
      dataType: 'nutritionix',
    };
  } catch (err) {
    log.warn({ err, latencyMs: Date.now() - started, success: false }, 'nutritionix request failed');
    return null;
  }
}
