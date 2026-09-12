import { describe, expect, it } from 'vitest';
import type { DailyScore } from '@petplate/shared';
import { streakLength } from '../../src/services/scoring/streak';

function row(dayKey: string, counted: boolean): DailyScore {
  return {
    dayKey,
    human: { consumedKcal: 0, targetKcal: 0, proteinG: 0, score: counted ? 80 : 10 },
    pet: { fedGrams: 0, targetGrams: 0, fedKcal: 0, targetKcal: 0, score: counted ? 80 : 10 },
    combined: counted ? 80 : 10,
    avatarState: counted ? 'thriving' : 'drooping',
    mood: counted ? 'thriving' : 'drooping',
    streakCounted: counted,
    streakLength: 0,
    finalized: true,
  };
}

describe('streakLength', () => {
  it('D-4..D-1 all counted, today counted → 5', () => {
    const rows = [
      row('2026-09-12', true),
      row('2026-09-11', true),
      row('2026-09-10', true),
      row('2026-09-09', true),
      row('2026-09-08', true),
    ];
    expect(streakLength(rows, '2026-09-12')).toBe(5);
  });

  it('D-2 missing → 1 (only D-1) + today → 2', () => {
    const rows = [row('2026-09-12', true), row('2026-09-11', true), row('2026-09-09', true)];
    expect(streakLength(rows, '2026-09-12')).toBe(2);
  });

  it('today not counted, D-1..D-3 counted → 3', () => {
    const rows = [
      row('2026-09-12', false),
      row('2026-09-11', true),
      row('2026-09-10', true),
      row('2026-09-09', true),
    ];
    expect(streakLength(rows, '2026-09-12')).toBe(3);
  });
});
