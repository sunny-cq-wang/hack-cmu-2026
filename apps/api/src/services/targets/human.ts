/**
 * TODO(P3): replace this stub with the full ALGORITHMS §1 implementation + vitest spec.
 * Signature is frozen for P2 (`PUT /me/profile`, seed).
 */
import {
  ACTIVITY_FACTORS,
  DRI_AGE_OVERRIDES_50,
  DRI_TABLE,
  GOAL_OFFSETS,
  HumanTargetsSchema,
  KCAL_FLOORS,
  type HumanProfile,
  type HumanTargets,
  type Nutrients,
} from '@petplate/shared';

export function computeHumanTargets(profile: HumanProfile, adaptiveOffsetKcal = 0): HumanTargets {
  const bmr =
    profile.sex === 'male'
      ? 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age + 5
      : 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age - 161;
  const tdee = bmr * ACTIVITY_FACTORS[profile.activity];
  const floor = KCAL_FLOORS[profile.sex];
  const baseKcal = Math.max(Math.round(tdee + GOAL_OFFSETS[profile.goal]), floor);
  const clampedOffset = Math.min(300, Math.max(-300, adaptiveOffsetKcal));
  const kcal = Math.min(Math.max(baseKcal + clampedOffset, floor), baseKcal + 300);
  const proteinG = Math.round(1.6 * profile.weightKg);
  const fatG = Math.round((0.25 * kcal) / 9);
  const carbsG = Math.max(50, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));

  const micros: Partial<Nutrients> = { ...DRI_TABLE[profile.sex] };
  if (profile.age > 50) {
    micros.calciumMg = DRI_AGE_OVERRIDES_50.calciumMg;
    micros.vitaminDUg = DRI_AGE_OVERRIDES_50.vitaminDUg;
    if (profile.sex === 'female') micros.ironMg = DRI_AGE_OVERRIDES_50.ironMgFemale;
  }

  return HumanTargetsSchema.parse({
    kcal,
    baseKcal,
    adaptiveOffsetKcal: clampedOffset,
    proteinG,
    carbsG,
    fatG,
    micros,
    computedAt: new Date().toISOString(),
    lastAdjustedAt: null,
  });
}
