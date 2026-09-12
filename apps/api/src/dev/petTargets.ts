/**
 * P3 stub — ALGORITHMS.md §2. Real home: services/targets/pet.ts.
 * Portioning uses IDEAL weight, not current weight (AGENTS.md §8).
 */
import type { PetInput, PetTargets } from '@petplate/shared';

export function merFactor(pet: Pick<PetInput, 'species' | 'neutered' | 'activity' | 'ageYears'>): number {
  if (pet.ageYears !== null && pet.ageYears < 1) return 2.0;
  const base = pet.neutered ? 1.6 : 1.8;
  const activityAdjust = pet.activity === 'low' ? -0.2 : pet.activity === 'high' ? 0.2 : 0;
  return Number((base + activityAdjust).toFixed(2));
}

export function computePetTargets(pet: PetInput): PetTargets {
  // Virtual pets use dog math with a fixed 10 kg ideal weight (DATA_MODEL §2).
  const idealKg = pet.species === 'virtual' ? 10 : pet.idealWeightKg;
  const rerKcal = Math.round(70 * Math.pow(idealKg, 0.75));
  const factor = merFactor(pet);
  const baseKcal = Math.round(rerKcal * factor);
  const adaptivePct = 0; // TODO(P3): adaptive weigh-in loop.
  const kcal = Math.max(rerKcal, Math.round(baseKcal * (1 + adaptivePct / 100)));
  const kcalPerGram = pet.food.kcalPerCup / pet.food.gramsPerCup;

  return {
    rerKcal,
    merFactor: factor,
    baseKcal,
    adaptivePct,
    kcal,
    portionGramsPerDay: Math.round(kcal / kcalPerGram),
    mealsPerDay: pet.mealsPerDay,
    computedAt: new Date().toISOString(),
    lastAdjustedAt: null,
  };
}

export const goalFor = (pet: Pick<PetInput, 'weightKg' | 'idealWeightKg'>): 'lose' | 'maintain' =>
  pet.weightKg > pet.idealWeightKg * 1.05 ? 'lose' : 'maintain';
