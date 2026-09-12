import type { Nutrients } from '@petplate/shared';

export const NUTRIENT_IDS: Record<keyof Nutrients, number> = {
  kcal: 1008,
  proteinG: 1003,
  fatG: 1004,
  carbsG: 1005,
  fiberG: 1079,
  calciumMg: 1087,
  ironMg: 1089,
  magnesiumMg: 1090,
  potassiumMg: 1092,
  sodiumMg: 1093,
  zincMg: 1095,
  vitaminCMg: 1162,
  vitaminDUg: 1114,
  vitaminARaeUg: 1106,
  folateUg: 1177,
  vitaminB12Ug: 1178,
};

export const NUTRIENT_ID_TO_KEY: Record<number, keyof Nutrients> = Object.fromEntries(
  Object.entries(NUTRIENT_IDS).map(([key, id]) => [id, key as keyof Nutrients]),
) as Record<number, keyof Nutrients>;
