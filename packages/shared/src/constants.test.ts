import { describe, expect, it } from 'vitest';
import { DEFAULT_FOOD, GAP_THRESHOLD_PCT, SCORE_THRESHOLDS, SUGGEST_FOODS } from './constants';

describe('constants', () => {
  it('matches ALGORITHMS §7 policy values', () => {
    expect(SCORE_THRESHOLDS).toEqual({ streak: 70, thriving: 80, okay: 50 });
    expect(GAP_THRESHOLD_PCT).toBe(70);
    expect(DEFAULT_FOOD).toEqual({ kcalPerCup: 375, gramsPerCup: 110 });
    expect(SUGGEST_FOODS.fiberG).toHaveLength(3);
  });
});
