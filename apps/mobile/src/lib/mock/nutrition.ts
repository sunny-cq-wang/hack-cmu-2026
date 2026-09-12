// MOCK ONLY — not shipped logic; server owns all math (AGENTS.md §4.3)
//
// A pocket-sized stand-in for USDA FoodData Central so mock mode can move real
// numbers around. Values are per 100 g, same as the real thing.
import { NutrientsSchema, emptyNutrients, type Nutrients } from '@petplate/shared';

type Per100g = Partial<Nutrients> & { kcal: number };

const FOODS: Record<string, Per100g> = {
  'grilled chicken breast': { kcal: 165, proteinG: 31, carbsG: 0, fatG: 3.6, potassiumMg: 256, ironMg: 1, zincMg: 1 },
  'brown rice, cooked': { kcal: 112, proteinG: 2.6, carbsG: 24, fatG: 0.9, fiberG: 1.8, magnesiumMg: 43, ironMg: 0.5 },
  'broccoli, steamed': { kcal: 35, proteinG: 2.4, carbsG: 7.2, fatG: 0.4, fiberG: 3.3, vitaminCMg: 65, calciumMg: 40, folateUg: 61 },
  'olive oil': { kcal: 884, proteinG: 0, carbsG: 0, fatG: 100 },
  'greek yogurt': { kcal: 59, proteinG: 10, carbsG: 3.6, fatG: 0.4, calciumMg: 110, vitaminB12Ug: 0.8 },
  'rolled oats': { kcal: 379, proteinG: 13, carbsG: 68, fatG: 6.5, fiberG: 10, ironMg: 4.7, magnesiumMg: 138 },
  raspberries: { kcal: 52, proteinG: 1.2, carbsG: 12, fatG: 0.7, fiberG: 6.5, vitaminCMg: 26 },
  lentils: { kcal: 116, proteinG: 9, carbsG: 20, fatG: 0.4, fiberG: 7.9, ironMg: 3.3, folateUg: 181, potassiumMg: 369 },
  spinach: { kcal: 23, proteinG: 2.9, carbsG: 3.6, fatG: 0.4, fiberG: 2.2, ironMg: 2.7, potassiumMg: 558, vitaminARaeUg: 469 },
  banana: { kcal: 89, proteinG: 1.1, carbsG: 23, fatG: 0.3, fiberG: 2.6, potassiumMg: 358, vitaminCMg: 8.7 },
  salmon: { kcal: 208, proteinG: 20, carbsG: 0, fatG: 13, vitaminDUg: 11, vitaminB12Ug: 3.2 },
};

const GENERIC: Per100g = { kcal: 130, proteinG: 5, carbsG: 18, fatG: 4, fiberG: 1.5 };

/** Deterministic so the same typed-in food always produces the same numbers. */
export function nutrientsFor(name: string, grams: number): Nutrients {
  const key = name.trim().toLowerCase();
  const match = FOODS[key] ?? Object.entries(FOODS).find(([food]) => key.includes(food) || food.includes(key))?.[1];
  const per100g = match ?? GENERIC;
  const factor = grams / 100;

  const scaled: Record<string, number> = {};
  for (const [nutrient, value] of Object.entries(per100g)) {
    scaled[nutrient] = Math.round(value * factor * 10) / 10;
  }
  return NutrientsSchema.parse(scaled);
}

export function sumNutrients(parts: Nutrients[]): Nutrients {
  return parts.reduce<Nutrients>((total, part) => {
    const merged: Record<string, number> = { ...total };
    for (const [nutrient, value] of Object.entries(part)) {
      merged[nutrient] = Math.round(((merged[nutrient] ?? 0) + value) * 10) / 10;
    }
    return NutrientsSchema.parse(merged);
  }, emptyNutrients());
}

export function knownFoodNames(): string[] {
  return Object.keys(FOODS);
}
