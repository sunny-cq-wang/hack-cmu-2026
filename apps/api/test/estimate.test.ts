import { describe, expect, it } from 'vitest';
import { sanitizePer100g } from '../src/services/nutrition/estimate';

const raw = (over: Partial<Parameters<typeof sanitizePer100g>[0]> = {}) => ({
  kcal: 180,
  proteinG: 8,
  fatG: 7,
  carbsG: 21,
  fiberG: 2,
  ...over,
});

describe('sanitizePer100g', () => {
  it('keeps a plausible estimate and leaves micros at zero', () => {
    const out = sanitizePer100g(raw());
    expect(out).not.toBeNull();
    expect(out?.kcal).toBe(180);
    expect(out?.proteinG).toBe(8);
    expect(out?.fatG).toBe(7);
    expect(out?.carbsG).toBe(21);
    expect(out?.fiberG).toBe(2);
    expect(out?.ironMg).toBe(0);
    expect(out?.sodiumMg).toBe(0);
  });

  it('rejects kcal that is zero, negative, not finite, or denser than pure fat', () => {
    expect(sanitizePer100g(raw({ kcal: 0 }))).toBeNull();
    expect(sanitizePer100g(raw({ kcal: -50 }))).toBeNull();
    expect(sanitizePer100g(raw({ kcal: Number.NaN }))).toBeNull();
    expect(sanitizePer100g(raw({ kcal: 1200 }))).toBeNull();
  });

  it('clamps macros into 0-100 g per 100 g', () => {
    const out = sanitizePer100g(raw({ proteinG: -3, fatG: 140, carbsG: 250 }));
    expect(out?.proteinG).toBe(0);
    expect(out?.fatG).toBe(100);
    expect(out?.carbsG).toBe(100);
  });

  it('caps fiber at total carbohydrate, which includes it', () => {
    const out = sanitizePer100g(raw({ carbsG: 5, fiberG: 40 }));
    expect(out?.fiberG).toBe(5);
  });

  it('trusts kcal over a macro sum that disagrees with it', () => {
    const out = sanitizePer100g(raw({ kcal: 100, proteinG: 30, fatG: 30, carbsG: 30 }));
    expect(out?.kcal).toBe(100);
    expect(out?.proteinG).toBe(30);
  });
});
