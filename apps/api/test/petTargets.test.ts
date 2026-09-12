import { describe, expect, it } from 'vitest';
import { PetInputSchema } from '@petplate/shared';
import { computePetTargets, goalFor, merFactor } from '../src/dev/petTargets.js';

const biscuit = PetInputSchema.parse({
  name: 'Biscuit',
  species: 'dog',
  breed: 'Beagle mix',
  neutered: true,
  ageYears: 4,
  weightKg: 14,
  idealWeightKg: 12,
  activity: 'normal',
  food: { name: 'Blue Buffalo Adult', kcalPerCup: 377, gramsPerCup: 110 },
  mealsPerDay: 2,
});

describe('computePetTargets', () => {
  it('derives RER from IDEAL weight, not current weight (AGENTS.md §8)', () => {
    const fromIdeal = computePetTargets(biscuit).rerKcal;
    const ifCurrentWereUsed = Math.round(70 * Math.pow(14, 0.75));
    expect(fromIdeal).toBe(Math.round(70 * Math.pow(12, 0.75)));
    expect(fromIdeal).not.toBe(ifCurrentWereUsed);
  });

  it('converts kcal to grams using the food density', () => {
    const targets = computePetTargets(biscuit);
    const kcalPerGram = 377 / 110;
    expect(targets.portionGramsPerDay).toBe(Math.round(targets.kcal / kcalPerGram));
  });

  it('never floors kcal below RER', () => {
    const targets = computePetTargets(biscuit);
    expect(targets.kcal).toBeGreaterThanOrEqual(targets.rerKcal);
  });

  it('treats virtual pets as a fixed 10 kg dog', () => {
    const virtual = PetInputSchema.parse({
      name: 'Pixel',
      species: 'virtual',
      weightKg: 999,
      idealWeightKg: 999,
    });
    expect(computePetTargets(virtual).rerKcal).toBe(Math.round(70 * Math.pow(10, 0.75)));
  });
});

describe('merFactor', () => {
  it('is lower for neutered pets and adjusts for activity', () => {
    expect(merFactor({ species: 'dog', neutered: true, activity: 'normal', ageYears: 4 })).toBe(1.6);
    expect(merFactor({ species: 'dog', neutered: false, activity: 'normal', ageYears: 4 })).toBe(1.8);
    expect(merFactor({ species: 'dog', neutered: true, activity: 'high', ageYears: 4 })).toBe(1.8);
    expect(merFactor({ species: 'dog', neutered: true, activity: 'low', ageYears: 4 })).toBe(1.4);
  });

  it('uses the growth factor for puppies under a year', () => {
    expect(merFactor({ species: 'dog', neutered: true, activity: 'normal', ageYears: 0.5 })).toBe(2.0);
  });
});

describe('goalFor', () => {
  it('is lose only past the 5% tolerance band', () => {
    expect(goalFor({ weightKg: 14, idealWeightKg: 12 })).toBe('lose');
    expect(goalFor({ weightKg: 12.5, idealWeightKg: 12 })).toBe('maintain');
    expect(goalFor({ weightKg: 12, idealWeightKg: 12 })).toBe('maintain');
  });
});
