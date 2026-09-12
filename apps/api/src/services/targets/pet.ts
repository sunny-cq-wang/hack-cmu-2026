/**
 * TODO(P3): replace this stub with the full ALGORITHMS §2 implementation + Biscuit spec.
 * Signature is frozen for P2 (`seed:demo`).
 */
import {
  DEFAULT_FOOD,
  MER_FACTORS,
  PetTargetsSchema,
  type PetInput,
  type PetTargets,
} from '@petplate/shared';

export function computePetTargets(
  pet: PetInput & { adaptivePct?: number },
): PetTargets & { goal: 'lose' | 'maintain' } {
  const species = pet.species === 'virtual' ? 'dog' : pet.species;
  const weightKg = pet.species === 'virtual' ? 10 : pet.weightKg;
  const idealWeightKg = pet.species === 'virtual' ? 10 : pet.idealWeightKg;
  const neutered = pet.species === 'virtual' ? true : pet.neutered;
  const goal: 'lose' | 'maintain' = weightKg > idealWeightKg * 1.05 ? 'lose' : 'maintain';
  const refKg = goal === 'lose' ? idealWeightKg : weightKg;
  const rerKcal = 70 * refKg ** 0.75;
  const table = MER_FACTORS[species];
  let merFactor = goal === 'lose' ? table.lose : neutered ? table.maintainNeutered : table.maintainIntact;
  if (goal !== 'lose') {
    if (pet.activity === 'high') merFactor += table.activityHigh;
    if (pet.activity === 'low') merFactor += table.activityLow;
  }
  const baseKcal = rerKcal * merFactor;
  const adaptivePct = Math.min(20, Math.max(-20, pet.adaptivePct ?? 0));
  const kcal = Math.max(baseKcal * (1 + adaptivePct / 100), rerKcal);
  const food = pet.food ?? DEFAULT_FOOD;
  const kcalPerGram = food.kcalPerCup / food.gramsPerCup;
  const portionGramsPerDay = Math.round(kcal / kcalPerGram);
  const mealsPerDay = pet.mealsPerDay ?? 2;
  const roundedKcal = Math.round(kcal);
  const roundedBase = Math.round(baseKcal);

  return {
    goal,
    ...PetTargetsSchema.parse({
      rerKcal,
      merFactor,
      baseKcal: roundedBase,
      adaptivePct,
      kcal: roundedKcal,
      portionGramsPerDay,
      mealsPerDay,
      computedAt: new Date().toISOString(),
      lastAdjustedAt: null,
    }),
  };
}
