import { describe, expect, it } from 'vitest';
import { avatarStateFor, combinedScore, humanScore, moodFor, petScore } from '../../src/services/scoring/score';

describe('humanScore', () => {
  it('2100 target, consumed 2000, protein 130/130 → 91', () => {
    expect(humanScore(2000, 2100, 130, 130)).toBe(91);
  });

  it('consumed 0 → 0', () => {
    expect(humanScore(0, 2100, 0, 130)).toBe(0);
  });

  it('consumed 3150 (150%) → kcalScore 0, total ≤ 10 even with protein bonus', () => {
    const s = humanScore(3150, 2100, 130, 130);
    expect(s).toBeLessThanOrEqual(10);
  });
});

describe('petScore', () => {
  it('132 target, fed 66 → 0', () => {
    expect(petScore(66, 132)).toBe(0);
  });
  it('fed 132 → 100', () => {
    expect(petScore(132, 132)).toBe(100);
  });
  it('fed 145 (110%) → 80', () => {
    expect(petScore(145, 132)).toBe(80);
  });
});

describe('combinedScore / avatarStateFor', () => {
  it('81 & 100 → 91 → thriving', () => {
    const c = combinedScore(81, 100);
    expect(c).toBe(91);
    expect(avatarStateFor(c)).toBe('thriving');
  });
  it('81 & 0 → 41 → drooping', () => {
    const c = combinedScore(81, 0);
    expect(c).toBe(41);
    expect(avatarStateFor(c)).toBe('drooping');
  });
});

describe('moodFor', () => {
  it('at 12:00 expectedFrac (12−7)/14 = 0.357: human 750/2100 paced 1.0 → 100; pet 66/132 paced 1.4 → 20 → 60 okay', () => {
    expect(moodFor({ hour: 12, consumedKcal: 750, targetKcal: 2100, fedGrams: 66, targetGrams: 132 })).toBe('okay');
  });
  it('at 06:00 expectedFrac clamps to 0.15', () => {
    const early = moodFor({ hour: 6, consumedKcal: 750, targetKcal: 2100, fedGrams: 66, targetGrams: 132 });
    const atFloor = moodFor({ hour: 7, consumedKcal: 750, targetKcal: 2100, fedGrams: 66, targetGrams: 132 });
    // 6:00 uses the same 0.15 floor as 7:00, so mood matches the 7:00 result
    expect(early).toBe(atFloor);
  });
});
