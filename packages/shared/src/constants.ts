import type { Nutrients } from './types';

export const ACTIVITY_FACTORS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
} as const;

export const GOAL_OFFSETS = {
  lose: -500,
  maintain: 0,
  gain: 300,
} as const;

export const KCAL_FLOORS = {
  female: 1200,
  male: 1500,
} as const;

export const DRI_TABLE = {
  female: {
    fiberG: 25,
    sodiumMg: 2300,
    potassiumMg: 2600,
    calciumMg: 1000,
    ironMg: 18,
    magnesiumMg: 310,
    zincMg: 8,
    vitaminCMg: 75,
    vitaminDUg: 15,
    vitaminARaeUg: 700,
    folateUg: 400,
    vitaminB12Ug: 2.4,
  },
  male: {
    fiberG: 38,
    sodiumMg: 2300,
    potassiumMg: 3400,
    calciumMg: 1000,
    ironMg: 8,
    magnesiumMg: 400,
    zincMg: 11,
    vitaminCMg: 90,
    vitaminDUg: 15,
    vitaminARaeUg: 900,
    folateUg: 400,
    vitaminB12Ug: 2.4,
  },
} as const;

/** Age > 50 overrides (ALGORITHMS §1.6). Female iron drops to 8. */
export const DRI_AGE_OVERRIDES_50 = {
  calciumMg: 1200,
  vitaminDUg: 20,
  ironMgFemale: 8,
} as const;

export const MER_FACTORS = {
  dog: {
    lose: 1.0,
    maintainNeutered: 1.6,
    maintainIntact: 1.8,
    activityHigh: 0.2,
    activityLow: -0.2,
  },
  cat: {
    lose: 0.8,
    maintainNeutered: 1.2,
    maintainIntact: 1.4,
    activityHigh: 0.1,
    activityLow: -0.1,
  },
} as const;

export const PET_WEEKLY_TARGETS = {
  dog: { lose: [-2.0, -0.5] as [number, number] },
  cat: { lose: [-1.0, -0.5] as [number, number] },
  maintain: [-0.5, 0.5] as [number, number],
} as const;

export const HUMAN_WEEKLY_TARGETS = {
  lose: -0.5,
  maintain: 0,
  gain: 0.25,
} as const;

export const SCORE_THRESHOLDS = {
  streak: 70,
  thriving: 80,
  okay: 50,
} as const;

export const GAP_THRESHOLD_PCT = 70;

export const SUGGEST_FOODS: Record<keyof Nutrients, string[]> = {
  kcal: [],
  proteinG: ['chicken breast', 'greek yogurt', 'lentils'],
  carbsG: ['oats', 'brown rice', 'sweet potato'],
  fatG: ['avocado', 'olive oil', 'salmon'],
  fiberG: ['lentils', 'raspberries', 'oats'],
  sodiumMg: [],
  potassiumMg: ['banana', 'white beans', 'spinach'],
  calciumMg: ['yogurt', 'tofu', 'kale'],
  ironMg: ['lentils', 'spinach', 'beef'],
  magnesiumMg: ['pumpkin seeds', 'almonds', 'spinach'],
  zincMg: ['oysters', 'beef', 'pumpkin seeds'],
  vitaminCMg: ['bell pepper', 'orange', 'broccoli'],
  vitaminDUg: ['salmon', 'fortified milk', 'eggs'],
  vitaminARaeUg: ['sweet potato', 'carrots', 'spinach'],
  folateUg: ['lentils', 'spinach', 'asparagus'],
  vitaminB12Ug: ['salmon', 'beef', 'eggs'],
};

export const NUTRIENT_LABELS: Record<keyof Nutrients, string> = {
  kcal: 'Calories',
  proteinG: 'Protein',
  carbsG: 'Carbs',
  fatG: 'Fat',
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

export const DEFAULT_FOOD = { kcalPerCup: 375, gramsPerCup: 110 } as const;
