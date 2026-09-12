import type { Nutrients } from './types';

/** TDEE multipliers (ALGORITHMS §1.2). */
export const ACTIVITY_FACTORS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
} as const;

/** kcal added to TDEE before the sex-specific floor (ALGORITHMS §1.3). */
export const GOAL_OFFSETS = {
  lose: -500,
  maintain: 0,
  gain: 300,
} as const;

export const KCAL_FLOORS = {
  female: 1200,
  male: 1500,
} as const;

/** Adult DRIs, 19–50. Age > 50 overrides in DRI_AGE_OVER_50 (ALGORITHMS §1.6). */
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
} as const satisfies Record<'female' | 'male', Partial<Nutrients>>;

export const DRI_AGE_OVER_50 = {
  calciumMg: 1200,
  vitaminDUg: 20,
  femaleIronMg: 8,
} as const;

export const PROTEIN_G_PER_KG = 1.6;
export const FAT_KCAL_FRACTION = 0.25;
export const CARBS_FLOOR_G = 50;
export const ADAPTIVE_OFFSET_CLAMP = 300;

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

export const PET_LOSE_THRESHOLD = 1.05;
export const RER_COEFFICIENT = 70;
export const ADAPTIVE_PCT_CLAMP = 20;
export const VIRTUAL_PET_KG = 10;

export const PET_WEEKLY_TARGETS = {
  dog: { lose: [-2.0, -0.5] as [number, number] },
  cat: { lose: [-1.0, -0.5] as [number, number] },
  maintain: [-0.5, 0.5] as [number, number],
} as const;

export const HUMAN_WEEKLY_TARGETS = {
  loseKg: -0.5,
  maintainKg: 0,
  gainKg: 0.25,
  loseSlowKg: -0.25,
  loseFastKg: -1.0,
  maintainAbsKg: 0.4,
  gainSlowKg: 0.1,
  gainFastKg: 0.6,
  offsetStep: 100,
} as const;

export const ADJUST_COOLDOWN_DAYS = 7;
export const WEIGHIN_WINDOW_DAYS = 14;
export const WEIGHIN_MIN_SPAN_DAYS = 5;
export const PET_SLOW_STEP_PCT = -5;
export const PET_FAST_STEP_PCT = 10;
export const PET_MAINTAIN_STEP_PCT = 5;
export const CAT_VET_FLAG_PCT = -1.0;

export const SCORE_THRESHOLDS = {
  streak: 70,
  thriving: 80,
  okay: 50,
} as const;

export const HUMAN_KCAL_WEIGHT = 0.9;
export const PROTEIN_BONUS_MAX = 10;
export const SCORE_PENALTY_PER_PCT = 2;
export const MOOD_DAY_START_HOUR = 7;
export const MOOD_DAY_LENGTH_HOURS = 14;
export const MOOD_FRAC_FLOOR = 0.15;

export const GAP_THRESHOLD_PCT = 70;

export const SUGGEST_FOODS: Record<string, readonly [string, string, string]> = {
  fiberG: ['lentils', 'raspberries', 'oats'],
  potassiumMg: ['banana', 'white beans', 'spinach'],
  calciumMg: ['yogurt', 'tofu', 'kale'],
  ironMg: ['lentils', 'spinach', 'beef liver'],
  magnesiumMg: ['pumpkin seeds', 'almonds', 'spinach'],
  zincMg: ['oysters', 'beef', 'pumpkin seeds'],
  vitaminCMg: ['red bell pepper', 'kiwi', 'broccoli'],
  vitaminDUg: ['salmon', 'fortified milk', 'egg yolks'],
  vitaminARaeUg: ['sweet potato', 'carrots', 'spinach'],
  folateUg: ['lentils', 'spinach', 'asparagus'],
  vitaminB12Ug: ['clams', 'salmon', 'beef'],
};

export const DEFAULT_FOOD = { kcalPerCup: 375, gramsPerCup: 110 } as const;
