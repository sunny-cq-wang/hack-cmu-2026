import { describe, expect, it } from 'vitest';
import { computeBmr, computeHumanTargets } from '../../src/services/targets/human';

/**
 * Rounding rule: BMR is NOT rounded (male 25/178/80 → 1792.5).
 * TDEE is not rounded. baseKcal = max(round(TDEE + goalOffset), sex floor).
 * adaptiveOffsetKcal is clamped to ±300 before adding.
 */

const maleLose = {
  sex: 'male' as const,
  age: 25,
  heightCm: 178,
  weightKg: 80,
  activity: 'moderate' as const,
  goal: 'lose' as const,
  targetWeightKg: 75,
  dietaryPrefs: [],
  allergies: [],
};

const femaleLose = {
  sex: 'female' as const,
  age: 40,
  heightCm: 160,
  weightKg: 55,
  activity: 'sedentary' as const,
  goal: 'lose' as const,
  targetWeightKg: 50,
  dietaryPrefs: [],
  allergies: [],
};

describe('computeBmr (Mifflin-St Jeor)', () => {
  it('male 25 y, 178 cm, 80 kg → 1792.5', () => {
    expect(computeBmr(maleLose)).toBe(1792.5);
  });
});

describe('computeHumanTargets', () => {
  it('male moderate lose: TDEE = BMR×1.55, base = TDEE−500, floor 1500 does not apply', () => {
    const t = computeHumanTargets(maleLose);
    const tdee = 1792.5 * 1.55;
    expect(t.baseKcal).toBe(Math.round(tdee - 500));
    expect(t.baseKcal).toBeGreaterThanOrEqual(1500);
    expect(t.kcal).toBe(t.baseKcal);
  });

  it('female sedentary lose: floor 1200 applies', () => {
    const t = computeHumanTargets(femaleLose);
    expect(t.baseKcal).toBe(1200);
    expect(t.kcal).toBe(1200);
  });

  it('adaptive offset −400 clamps to −300; +500 clamps to +300', () => {
    const down = computeHumanTargets(maleLose, -400);
    expect(down.adaptiveOffsetKcal).toBe(-300);
    expect(down.kcal).toBe(down.baseKcal - 300);
    const up = computeHumanTargets(maleLose, 500);
    expect(up.adaptiveOffsetKcal).toBe(300);
    expect(up.kcal).toBe(up.baseKcal + 300);
  });

  it('macros: proteinG = 1.6×kg; carbs never below 50', () => {
    const t = computeHumanTargets(maleLose);
    expect(t.proteinG).toBe(Math.round(1.6 * 80));
    expect(t.carbsG).toBeGreaterThanOrEqual(50);
    const tiny = computeHumanTargets({ ...femaleLose, weightKg: 30, goal: 'lose' });
    expect(tiny.carbsG).toBeGreaterThanOrEqual(50);
  });

  it('micros: male iron 8, female 18; age 55 female → calcium 1200, vitamin D 20', () => {
    const m = computeHumanTargets(maleLose);
    expect(m.micros.ironMg).toBe(8);
    const f = computeHumanTargets(femaleLose);
    expect(f.micros.ironMg).toBe(18);
    const older = computeHumanTargets({ ...femaleLose, age: 55 });
    expect(older.micros.calciumMg).toBe(1200);
    expect(older.micros.vitaminDUg).toBe(20);
    expect(older.micros.ironMg).toBe(8);
  });
});
