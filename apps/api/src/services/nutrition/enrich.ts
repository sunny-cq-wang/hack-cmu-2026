import { NUTRIENT_KEYS, emptyNutrients, type MealItem, type Nutrients } from '@petplate/shared';

export function sumNutrients(list: Nutrients[]): Nutrients {
  const out = emptyNutrients();
  for (const nutrients of list) {
    for (const key of NUTRIENT_KEYS) {
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

/** Filled in by P2 USDA work. Placeholder so scoring can compile. */
export async function enrichItems(items: EnrichInput[]): Promise<MealItem[]> {
  return items.map((item) => ({
    name: item.name,
    grams: item.grams,
    nutrients: { ...emptyNutrients(), kcal: item.estimatedKcal ?? 0 },
    fdcId: item.fdcId ?? null,
    matchSource: 'grok_estimate' as const,
    confidence: item.confidence ?? 1,
  }));
}
