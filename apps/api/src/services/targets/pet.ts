import {
  ADAPTIVE_PCT_CLAMP,
  DEFAULT_FOOD,
  MER_FACTORS,
  PET_LOSE_THRESHOLD,
  RER_COEFFICIENT,
  VIRTUAL_PET_KG,
  type PetInput,
  type PetTargets,
} from '@petplate/shared';
import { clamp } from './human.js';

export function roundToHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

type MerSpecies = 'dog' | 'cat';

export function derivePetGoal(weightKg: number, idealWeightKg: number): 'lose' | 'maintain' {
  return weightKg > idealWeightKg * PET_LOSE_THRESHOLD ? 'lose' : 'maintain';
}

export function merFactor(
  species: MerSpecies,
  goal: 'lose' | 'maintain',
  neutered: boolean,
  activity: PetInput['activity'],
): number {
  const table = MER_FACTORS[species];
  let factor = goal === 'lose' ? table.lose : neutered ? table.maintainNeutered : table.maintainIntact;
  if (goal !== 'lose') {
    if (activity === 'high') factor += table.activityHigh;
    if (activity === 'low') factor += table.activityLow;
  }
  return factor;
}

export function computePetTargets(pet: PetInput & { adaptivePct?: number }): PetTargets & { goal: 'lose' | 'maintain' } {
  const virtual = pet.species === 'virtual';
  const species: MerSpecies = pet.species === 'cat' ? 'cat' : 'dog';
  const weightKg = virtual ? VIRTUAL_PET_KG : pet.weightKg;
  const idealWeightKg = virtual ? VIRTUAL_PET_KG : pet.idealWeightKg;
  const neutered = virtual ? true : pet.neutered;
  const goal = derivePetGoal(weightKg, idealWeightKg);
  const refKg = goal === 'lose' ? idealWeightKg : weightKg;
  const rerKcal = roundToHalf(RER_COEFFICIENT * Math.pow(refKg, 0.75));
  const factor = merFactor(species, goal, neutered, pet.activity);
  const adaptivePct = clamp(pet.adaptivePct ?? 0, -ADAPTIVE_PCT_CLAMP, ADAPTIVE_PCT_CLAMP);
  const baseKcal = Math.round(rerKcal * factor);
  const kcal = Math.max(Math.round(baseKcal * (1 + adaptivePct / 100)), Math.round(rerKcal));
  const food = pet.food ?? DEFAULT_FOOD;
  const kcalPerGram = food.kcalPerCup / food.gramsPerCup;
  const portionGramsPerDay = Math.round(kcal / kcalPerGram);
  const mealsPerDay = pet.mealsPerDay ?? 2;
  return {
    goal,
    rerKcal,
    merFactor: factor,
    baseKcal,
    adaptivePct,
    kcal,
    portionGramsPerDay,
    mealsPerDay,
    computedAt: new Date().toISOString(),
    lastAdjustedAt: null,
  };
}
