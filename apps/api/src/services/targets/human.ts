import {
  ACTIVITY_FACTORS,
  ADAPTIVE_OFFSET_CLAMP,
  CARBS_FLOOR_G,
  DRI_AGE_OVER_50,
  DRI_TABLE,
  FAT_KCAL_FRACTION,
  GOAL_OFFSETS,
  KCAL_FLOORS,
  PROTEIN_G_PER_KG,
} from '@petplate/shared';
import type { HumanProfile, HumanTargets, Nutrients } from '@petplate/shared';

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Mifflin-St Jeor. Not rounded — male 25/178/80 = 1792.5. */
export function computeBmr(profile: Pick<HumanProfile, 'sex' | 'age' | 'heightCm' | 'weightKg'>): number {
  const base = 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age;
  return profile.sex === 'male' ? base + 5 : base - 161;
}

export function microsFor(sex: HumanProfile['sex'], age: number): Partial<Nutrients> {
  const table = { ...DRI_TABLE[sex] };
  if (age > 50) {
    table.calciumMg = DRI_AGE_OVER_50.calciumMg;
    table.vitaminDUg = DRI_AGE_OVER_50.vitaminDUg;
    if (sex === 'female') table.ironMg = DRI_AGE_OVER_50.femaleIronMg;
  }
  return table;
}

export function computeHumanTargets(profile: HumanProfile, adaptiveOffsetKcal = 0): HumanTargets {
  const bmr = computeBmr(profile);
  const tdee = bmr * ACTIVITY_FACTORS[profile.activity];
  const floor = KCAL_FLOORS[profile.sex];
  const baseKcal = Math.max(Math.round(tdee + GOAL_OFFSETS[profile.goal]), floor);
  const offset = clamp(adaptiveOffsetKcal, -ADAPTIVE_OFFSET_CLAMP, ADAPTIVE_OFFSET_CLAMP);
  const kcal = clamp(baseKcal + offset, floor, baseKcal + ADAPTIVE_OFFSET_CLAMP);
  const proteinG = Math.round(PROTEIN_G_PER_KG * profile.weightKg);
  const fatG = Math.round((FAT_KCAL_FRACTION * kcal) / 9);
  const carbsG = Math.max(CARBS_FLOOR_G, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));
  return {
    kcal,
    baseKcal,
    adaptiveOffsetKcal: offset,
    proteinG,
    carbsG,
    fatG,
    micros: microsFor(profile.sex, profile.age),
    computedAt: new Date().toISOString(),
    lastAdjustedAt: null,
  };
}
