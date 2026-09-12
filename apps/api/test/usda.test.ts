import { describe, expect, it } from 'vitest';
import { emptyNutrients } from '@petplate/shared';
import { nutrientsFromFdc, scaleNutrients } from '../src/services/usda/fdc';

describe('scaleNutrients', () => {
  it('scales per-100g values by grams/100', () => {
    const per100g = { ...emptyNutrients(), kcal: 165, proteinG: 31, ironMg: 1.2 };
    const scaled = scaleNutrients(per100g, 150);
    expect(scaled.kcal).toBeCloseTo(247.5);
    expect(scaled.proteinG).toBeCloseTo(46.5);
    expect(scaled.ironMg).toBeCloseTo(1.8);
    expect(scaled.fiberG).toBe(0);
  });
});

describe('nutrientsFromFdc', () => {
  it('maps nutrient.id and nutrientId, missing → 0', () => {
    const parsed = nutrientsFromFdc([
      { nutrientId: 1008, value: 165 },
      { nutrient: { id: 1003 }, amount: 31 },
    ]);
    expect(parsed.kcal).toBe(165);
    expect(parsed.proteinG).toBe(31);
    expect(parsed.fatG).toBe(0);
  });
});
