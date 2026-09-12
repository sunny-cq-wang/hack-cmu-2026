import { describe, expect, it } from 'vitest';
import { computePetTargets } from '../../src/services/targets/pet';

const biscuit = {
  name: 'Biscuit',
  species: 'dog' as const,
  breed: 'Beagle mix',
  sex: 'male' as const,
  neutered: true,
  ageYears: 4,
  weightKg: 14,
  idealWeightKg: 12,
  activity: 'normal' as const,
  food: { name: 'Blue Buffalo Adult', kcalPerCup: 377, gramsPerCup: 110 },
  mealsPerDay: 2,
};

describe('computePetTargets', () => {
  it('Biscuit: dog 14/12 kg neutered normal → lose, RER 451.5, factor 1.0, kcal 452, portion 132, per meal 66', () => {
    const t = computePetTargets(biscuit);
    expect(t.goal).toBe('lose');
    expect(t.rerKcal).toBe(451.5);
    expect(t.merFactor).toBe(1.0);
    expect(t.kcal).toBe(452);
    expect(t.portionGramsPerDay).toBe(132);
    expect(Math.round(t.portionGramsPerDay / t.mealsPerDay)).toBe(66);
  });

  it('same pet at 12.2 kg → maintain (12.2 ≤ 12.6), factor 1.6', () => {
    const t = computePetTargets({ ...biscuit, weightKg: 12.2 });
    expect(t.goal).toBe('maintain');
    expect(t.merFactor).toBe(1.6);
    // Brief cited kcal 722 (= 451.5×1.6, lose-weight RER). Maintain uses current kg as refKg.
    expect(t.kcal).toBe(731);
  });

  it('cat 6/4.5 kg → lose, factor 0.8, RER ~216.7, kcal 217 (RER floor)', () => {
    const t = computePetTargets({
      name: 'Miso',
      species: 'cat',
      breed: null,
      sex: 'female',
      neutered: true,
      ageYears: 3,
      weightKg: 6,
      idealWeightKg: 4.5,
      activity: 'normal',
      food: { name: 'Dry food', kcalPerCup: 375, gramsPerCup: 110 },
      mealsPerDay: 2,
    });
    expect(t.goal).toBe('lose');
    expect(t.merFactor).toBe(0.8);
    expect(t.rerKcal).toBeCloseTo(216.7, 0);
    expect(t.kcal).toBe(217);
    expect(t.kcal).toBeGreaterThanOrEqual(Math.round(t.rerKcal));
  });

  it('adaptivePct −20 on Biscuit → 452×0.8 = 361 < RER 451.5 → floor → 452', () => {
    const t = computePetTargets({ ...biscuit, adaptivePct: -20 });
    expect(t.kcal).toBe(452);
  });

  it('virtual pet → dog math at 10 kg, maintain, factor 1.6 → kcal 630', () => {
    const t = computePetTargets({
      name: 'Pixel',
      species: 'virtual',
      breed: null,
      sex: null,
      neutered: true,
      ageYears: null,
      weightKg: 10,
      idealWeightKg: 10,
      activity: 'normal',
      food: { name: 'Dry food', kcalPerCup: 375, gramsPerCup: 110 },
      mealsPerDay: 2,
    });
    expect(t.goal).toBe('maintain');
    expect(t.merFactor).toBe(1.6);
    expect(t.kcal).toBe(630);
  });
});
