import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyNutrients } from '@petplate/shared';

vi.mock('../src/services/usda/fdc', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/usda/fdc')>();
  return {
    ...actual,
    lookupFood: vi.fn(),
    lookupFoodByFdcId: vi.fn(),
  };
});

vi.mock('../src/services/usda/nutritionix', () => ({
  lookupNutritionix: vi.fn(),
}));

vi.mock('../src/services/nutrition/estimate', () => ({
  estimatePer100g: vi.fn(),
}));

import { lookupFood, lookupFoodByFdcId } from '../src/services/usda/fdc';
import { lookupNutritionix } from '../src/services/usda/nutritionix';
import { estimatePer100g } from '../src/services/nutrition/estimate';
import { enrichItems, sumNutrients } from '../src/services/nutrition/enrich';

describe('sumNutrients', () => {
  it('adds every key across items', () => {
    const a = { ...emptyNutrients(), kcal: 100, proteinG: 10, fiberG: 3 };
    const b = { ...emptyNutrients(), kcal: 50, proteinG: 2, fiberG: 1 };
    const sum = sumNutrients([a, b]);
    expect(sum.kcal).toBe(150);
    expect(sum.proteinG).toBe(12);
    expect(sum.fiberG).toBe(4);
    expect(sum.ironMg).toBe(0);
  });
});

describe('enrichItems', () => {
  beforeEach(() => {
    vi.mocked(lookupFood).mockReset();
    vi.mocked(lookupFoodByFdcId).mockReset();
    vi.mocked(lookupNutritionix).mockReset();
    vi.mocked(lookupNutritionix).mockResolvedValue(null);
    vi.mocked(estimatePer100g).mockReset();
    vi.mocked(estimatePer100g).mockResolvedValue(null);
  });

  it('scales a USDA hit and degrades rejected lookups to grok_estimate', async () => {
    vi.mocked(lookupFoodByFdcId).mockResolvedValue({
      fdcId: 171477,
      description: 'Chicken',
      per100g: { ...emptyNutrients(), kcal: 165, proteinG: 31 },
      dataType: 'Foundation',
    });
    vi.mocked(lookupFood).mockRejectedValue(new Error('network'));

    const items = await enrichItems([
      { name: 'Chicken', grams: 100, fdcId: 171477 },
      { name: 'Mystery', grams: 50, estimatedKcal: 90 },
    ]);
    expect(items[0]?.matchSource).toBe('usda');
    expect(items[0]?.nutrients.kcal).toBe(165);
    expect(items[1]?.matchSource).toBe('grok_estimate');
    expect(items[1]?.nutrients.kcal).toBe(90);
  });

  it('prices a food missing from both databases from the grok per-100 g estimate', async () => {
    vi.mocked(lookupFood).mockResolvedValue(null);
    vi.mocked(estimatePer100g).mockResolvedValue({
      ...emptyNutrients(),
      kcal: 240,
      proteinG: 12,
    });

    const items = await enrichItems([{ name: 'Halo-halo', grams: 250, estimatedKcal: 400 }]);
    expect(estimatePer100g).toHaveBeenCalledWith('Halo-halo');
    expect(items[0]?.matchSource).toBe('grok_estimate');
    expect(items[0]?.fdcId).toBeNull();
    expect(items[0]?.nutrients.kcal).toBe(600);
    expect(items[0]?.nutrients.proteinG).toBe(30);
    // Micros stay 0: guessed micronutrients would pollute the gap analysis.
    expect(items[0]?.nutrients.ironMg).toBe(0);
  });

  it('falls back to the vision kcal when the grok estimate is unusable', async () => {
    vi.mocked(lookupFood).mockResolvedValue(null);
    vi.mocked(estimatePer100g).mockResolvedValue(null);

    const items = await enrichItems([{ name: 'Mystery stew', grams: 200, estimatedKcal: 310 }]);
    expect(items[0]?.matchSource).toBe('grok_estimate');
    expect(items[0]?.nutrients.kcal).toBe(310);
  });

  it('estimates against usdaQuery when the vision model gave one', async () => {
    vi.mocked(lookupFood).mockResolvedValue(null);
    vi.mocked(estimatePer100g).mockResolvedValue(null);

    await enrichItems([{ name: 'Mom’s adobo', grams: 150, usdaQuery: 'chicken adobo' }]);
    expect(estimatePer100g).toHaveBeenCalledWith('chicken adobo');
  });
});
