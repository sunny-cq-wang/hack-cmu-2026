/**
 * P2 stub — micronutrient gap analysis. Real home: services/nutrition/gaps.ts.
 *
 * Known limitation: the stub meal records carry only kcal and protein, so micro
 * intake reads as 0 and every micro shows as a gap. That is honest given no
 * micro tracking exists yet, and it keeps the voice agent's "top gap" wording real.
 */
import { emptyNutrients, GapsResponseSchema, type GapsResponse, type Nutrients } from '@petplate/shared';
import { store as db } from '../db/connect.js';
import { dayKey } from '../lib/day.js';

/** Adult DRI-ish reference values for the 12 micros tracked in shared. */
const MICRO_TARGETS: Partial<Nutrients> = {
  fiberG: 38,
  sodiumMg: 2300,
  potassiumMg: 3400,
  calciumMg: 1000,
  ironMg: 8,
  magnesiumMg: 420,
  zincMg: 11,
  vitaminCMg: 90,
  vitaminDUg: 20,
  vitaminARaeUg: 900,
  folateUg: 400,
  vitaminB12Ug: 2.4,
};

const LABELS: Record<string, string> = {
  fiberG: 'Fiber',
  sodiumMg: 'Sodium',
  potassiumMg: 'Potassium',
  calciumMg: 'Calcium',
  ironMg: 'Iron',
  magnesiumMg: 'Magnesium',
  zincMg: 'Zinc',
  vitaminCMg: 'Vitamin C',
  vitaminDUg: 'Vitamin D',
  vitaminARaeUg: 'Vitamin A',
  folateUg: 'Folate',
  vitaminB12Ug: 'Vitamin B12',
};

const SUGGESTIONS: Record<string, string[]> = {
  fiberG: ['lentils', 'raspberries', 'oats'],
  potassiumMg: ['banana', 'white beans', 'spinach'],
  calciumMg: ['yogurt', 'sardines', 'kale'],
  ironMg: ['beef', 'lentils', 'fortified cereal'],
  magnesiumMg: ['pumpkin seeds', 'almonds', 'black beans'],
  zincMg: ['oysters', 'beef', 'chickpeas'],
  vitaminCMg: ['bell pepper', 'orange', 'broccoli'],
  vitaminDUg: ['salmon', 'fortified milk', 'egg yolk'],
  vitaminARaeUg: ['sweet potato', 'carrot', 'spinach'],
  folateUg: ['lentils', 'asparagus', 'avocado'],
  vitaminB12Ug: ['salmon', 'beef', 'nutritional yeast'],
  sodiumMg: ['table salt', 'olives', 'broth'],
};

export async function getGaps(userId: string, days = 7): Promise<GapsResponse> {
  const user = await db.findUserById(userId);
  const timezone = user?.timezone;

  const avgIntake = emptyNutrients();
  let totalKcal = 0;
  let totalProtein = 0;
  for (let i = 0; i < days; i += 1) {
    const at = new Date(Date.now() - i * 86_400_000);
    const meals = await db.mealsForDay(userId, dayKey(at, timezone));
    totalKcal += meals.reduce((sum, m) => sum + m.kcal, 0);
    totalProtein += meals.reduce((sum, m) => sum + m.proteinG, 0);
  }
  avgIntake.kcal = Math.round(totalKcal / days);
  avgIntake.proteinG = Math.round(totalProtein / days);

  const gaps = Object.entries(MICRO_TARGETS)
    .map(([nutrient, target]) => {
      const intake = avgIntake[nutrient as keyof Nutrients] ?? 0;
      return {
        nutrient,
        pctOfTarget: Math.round((intake / (target as number)) * 100),
        label: LABELS[nutrient] ?? nutrient,
        suggestFoods: SUGGESTIONS[nutrient] ?? [],
      };
    })
    .filter((g) => g.pctOfTarget < 70)
    .sort((a, b) => a.pctOfTarget - b.pctOfTarget)
    .slice(0, 5);

  return GapsResponseSchema.parse({ days, avgIntake, targets: MICRO_TARGETS, gaps });
}
