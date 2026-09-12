import { describe, expect, it } from 'vitest';
import {
  adjustHuman,
  adjustPet,
  trend,
  weeklyChangePct,
} from '../../src/services/targets/adaptive';

const biscuitInput = {
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

function isoDaysAgo(days: number, now = new Date('2026-09-12T12:00:00Z')): string {
  return new Date(now.getTime() - days * 86400000).toISOString();
}

describe('weeklyChangePct', () => {
  it('two points 14 days apart 14.0 → 13.7 → −1.09%', () => {
    const pct = weeklyChangePct([
      { weighedAt: isoDaysAgo(14), weightKg: 14.0 },
      { weighedAt: isoDaysAgo(0), weightKg: 13.7 },
    ]);
    expect(pct).not.toBeNull();
    expect(pct!).toBeCloseTo(-1.09, 2);
  });

  it('one point → null', () => {
    expect(weeklyChangePct([{ weighedAt: isoDaysAgo(0), weightKg: 14 }])).toBeNull();
  });

  it('two points 3 days apart → null', () => {
    expect(
      weeklyChangePct([
        { weighedAt: isoDaysAgo(3), weightKg: 14.0 },
        { weighedAt: isoDaysAgo(0), weightKg: 13.9 },
      ]),
    ).toBeNull();
  });
});

describe('adjustPet', () => {
  const now = new Date('2026-09-12T12:00:00Z');
  const pointsSlow = [
    { weighedAt: isoDaysAgo(14, now), weightKg: 14.0 },
    { weighedAt: isoDaysAgo(0, now), weightKg: 13.9165 },
  ];

  it('dog lose, obs −0.3% → adaptivePct −5, message includes reduced 5%', () => {
    const latest = 14 / (1 + 0.3 / 50);
    const pts = [
      { weighedAt: isoDaysAgo(14, now), weightKg: 14.0 },
      { weighedAt: isoDaysAgo(0, now), weightKg: latest },
    ];
    const result = adjustPet({
      pet: biscuitInput,
      adaptivePct: 0,
      lastAdjustedAt: null,
      weighIns: pts,
      now,
    });
    expect(weeklyChangePct(pts)!).toBeCloseTo(-0.3, 1);
    expect(result.applied).toBe(true);
    expect(result.vetFlag).toBe(false);
    expect(result.after.portionGramsPerDay).toBeDefined();
    expect(result.message.toLowerCase()).toContain('reduced 5%');
  });

  it('dog lose, obs −2.5% → +10 and vetFlag', () => {
    const latest = 14 / (1 + 2.5 / 50);
    const pts = [
      { weighedAt: isoDaysAgo(14, now), weightKg: 14.0 },
      { weighedAt: isoDaysAgo(0, now), weightKg: latest },
    ];
    const result = adjustPet({
      pet: biscuitInput,
      adaptivePct: 0,
      lastAdjustedAt: null,
      weighIns: pts,
      now,
    });
    expect(weeklyChangePct(pts)!).toBeCloseTo(-2.5, 1);
    expect(result.applied).toBe(true);
    expect(result.vetFlag).toBe(true);
    expect(result.message).toMatch(/10%/);
  });

  it('cat obs −1.2% → +10 and vetFlag', () => {
    const cat = { ...biscuitInput, name: 'Miso', species: 'cat' as const, weightKg: 6, idealWeightKg: 4.5 };
    const latest = 6 / (1 + 1.2 / 50);
    const pts = [
      { weighedAt: isoDaysAgo(14, now), weightKg: 6.0 },
      { weighedAt: isoDaysAgo(0, now), weightKg: latest },
    ];
    const result = adjustPet({
      pet: cat,
      adaptivePct: 0,
      lastAdjustedAt: null,
      weighIns: pts,
      now,
    });
    expect(weeklyChangePct(pts)!).toBeCloseTo(-1.2, 1);
    expect(result.applied).toBe(true);
    expect(result.vetFlag).toBe(true);
  });

  it('lastAdjustedAt 3 days ago → no change, message adjusted recently', () => {
    const result = adjustPet({
      pet: biscuitInput,
      adaptivePct: -5,
      lastAdjustedAt: isoDaysAgo(3, now),
      weighIns: pointsSlow,
      now,
    });
    expect(result.applied).toBe(false);
    expect(result.message.toLowerCase()).toContain('adjusted recently');
  });
});

describe('adjustHuman', () => {
  const now = new Date('2026-09-12T12:00:00Z');
  const profile = {
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

  it('lose, obs −0.1 kg/wk → offset −100', () => {
    const pts = [
      { weighedAt: isoDaysAgo(14, now), weightKg: 80.2 },
      { weighedAt: isoDaysAgo(0, now), weightKg: 80.0 },
    ];
    const result = adjustHuman({
      profile,
      adaptiveOffsetKcal: 0,
      lastAdjustedAt: null,
      weighIns: pts,
      now,
    });
    expect(result.applied).toBe(true);
    expect(result.after.kcal).toBeLessThan(result.before.kcal);
    expect(result.message).toMatch(/100/);
  });

  it('lose, obs −1.2 kg/wk → offset +100', () => {
    const pts = [
      { weighedAt: isoDaysAgo(14, now), weightKg: 82.4 },
      { weighedAt: isoDaysAgo(0, now), weightKg: 80.0 },
    ];
    const result = adjustHuman({
      profile,
      adaptiveOffsetKcal: 0,
      lastAdjustedAt: null,
      weighIns: pts,
      now,
    });
    expect(result.applied).toBe(true);
    expect(result.after.kcal).toBeGreaterThan(result.before.kcal);
  });

  it('clamp at ±300', () => {
    const pts = [
      { weighedAt: isoDaysAgo(14, now), weightKg: 80.2 },
      { weighedAt: isoDaysAgo(0, now), weightKg: 80.0 },
    ];
    const result = adjustHuman({
      profile,
      adaptiveOffsetKcal: -300,
      lastAdjustedAt: null,
      weighIns: pts,
      now,
    });
    expect(result.applied).toBe(false);
    expect(result.after.kcal).toBe(result.before.kcal);
  });
});

describe('trend', () => {
  it('13.7 kg, ideal 12, slope −0.15/wk → ~today + 79 days', () => {
    const now = new Date('2026-09-12T12:00:00Z');
    const pts = [
      { weighedAt: isoDaysAgo(14, now), weightKg: 14.0 },
      { weighedAt: isoDaysAgo(0, now), weightKg: 13.7 },
    ];
    const t = trend(pts, 12, now);
    expect(t.slopeKgPerWeek).toBeCloseTo(-0.15, 2);
    expect(t.projectedGoalDate).not.toBeNull();
    const goal = new Date(`${t.projectedGoalDate}T00:00:00Z`);
    const days = Math.round((goal.getTime() - Date.UTC(2026, 8, 12)) / 86400000);
    expect(days).toBe(79);
  });

  it('wrong sign → projectedGoalDate null', () => {
    const now = new Date('2026-09-12T12:00:00Z');
    const pts = [
      { weighedAt: isoDaysAgo(14, now), weightKg: 13.4 },
      { weighedAt: isoDaysAgo(0, now), weightKg: 13.7 },
    ];
    const t = trend(pts, 12, now);
    expect(t.projectedGoalDate).toBeNull();
  });
});
