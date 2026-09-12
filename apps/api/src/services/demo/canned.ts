import { NutrientsSchema, emptyNutrients, VisionResultSchema, type Nutrients, type VisionResult } from '@petplate/shared';

/** Demo team: photograph grilled chicken breast + brown rice + steamed broccoli on a ~27 cm plate. */
export const FIXTURES = {
  chicken_rice_broccoli: VisionResultSchema.parse({
    items: [
      {
        name: 'Grilled chicken breast',
        grams: 150,
        confidence: 0.91,
        usdaQuery: 'chicken breast grilled',
        estimatedKcal: 248,
      },
      {
        name: 'Brown rice, cooked',
        grams: 180,
        confidence: 0.84,
        usdaQuery: 'rice brown cooked',
        estimatedKcal: 200,
      },
      {
        name: 'Broccoli, steamed',
        grams: 100,
        confidence: 0.88,
        usdaQuery: 'broccoli cooked boiled',
        estimatedKcal: 35,
      },
    ],
    mealNotes: 'Demo plate: chicken, rice, broccoli.',
  }),
  oatmeal_berries: VisionResultSchema.parse({
    items: [
      { name: 'Oatmeal, cooked', grams: 200, confidence: 0.9, usdaQuery: 'oats cooked', estimatedKcal: 150 },
      { name: 'Blueberries', grams: 80, confidence: 0.86, usdaQuery: 'blueberries raw', estimatedKcal: 45 },
      { name: 'Low-fat milk', grams: 120, confidence: 0.8, usdaQuery: 'milk low fat', estimatedKcal: 50 },
    ],
    mealNotes: 'Breakfast oatmeal bowl.',
  }),
  salmon_salad: VisionResultSchema.parse({
    items: [
      { name: 'Salmon, baked', grams: 140, confidence: 0.89, usdaQuery: 'salmon cooked', estimatedKcal: 280 },
      { name: 'Mixed salad greens', grams: 80, confidence: 0.82, usdaQuery: 'lettuce mixed greens', estimatedKcal: 15 },
      { name: 'Olive oil', grams: 10, confidence: 0.7, usdaQuery: 'oil olive', estimatedKcal: 88 },
    ],
    mealNotes: 'Salmon salad.',
  }),
} as const;

export type FixtureName = keyof typeof FIXTURES;

export function canned(_jpeg: Buffer): VisionResult {
  return FIXTURES.chicken_rice_broccoli;
}

/**
 * Stands in for a Grok per-100 g estimate when the chat call is unavailable in
 * DEMO_MODE. A middle-of-the-road cooked mixed dish, so a food USDA does not carry
 * still lands on the plate with a believable number instead of 0 kcal.
 */
export const CANNED_ESTIMATE_PER_100G: Nutrients = NutrientsSchema.parse({
  ...emptyNutrients(),
  kcal: 180,
  proteinG: 8,
  fatG: 7,
  carbsG: 21,
  fiberG: 2,
});
