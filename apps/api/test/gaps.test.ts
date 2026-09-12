import { describe, expect, it } from 'vitest';
import { emptyNutrients } from '@petplate/shared';
import { gapsFromAverages } from '../src/services/nutrition/gaps';

describe('gapsFromAverages', () => {
  it('returns micros below 70% of target, sorted, max 5, excluding sodium', () => {
    const avg = {
      ...emptyNutrients(),
      fiberG: 10,
      potassiumMg: 1000,
      ironMg: 2,
      calciumMg: 900,
      vitaminCMg: 10,
      folateUg: 50,
      magnesiumMg: 50,
      sodiumMg: 500,
    };
    const micros = {
      fiberG: 38,
      potassiumMg: 3400,
      ironMg: 8,
      calciumMg: 1000,
      vitaminCMg: 90,
      folateUg: 400,
      magnesiumMg: 400,
      sodiumMg: 2300,
    };
    const gaps = gapsFromAverages(avg, micros);
    expect(gaps.every((g) => g.nutrient !== 'sodiumMg')).toBe(true);
    expect(gaps).toHaveLength(5);
    expect(gaps[0]?.nutrient).toBe('vitaminCMg');
    expect(gaps[0]?.pctOfTarget).toBe(11);
    expect(gaps.some((g) => g.nutrient === 'calciumMg')).toBe(false);
    expect(gaps[0]?.suggestFoods.length).toBeGreaterThan(0);
  });
});
