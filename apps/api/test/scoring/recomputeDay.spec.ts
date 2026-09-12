import { describe, expect, it, vi, beforeEach } from 'vitest';
import { buildDailyScore } from '../../src/services/scoring/recomputeDay';
import { humanScore } from '../../src/services/scoring/score';
import type { DailyScore } from '@petplate/shared';

function counted(dayKey: string): DailyScore {
  return {
    dayKey,
    human: { consumedKcal: 2000, targetKcal: 2100, proteinG: 130, score: 80 },
    pet: { fedGrams: 132, targetGrams: 132, fedKcal: 452, targetKcal: 452, score: 80 },
    combined: 80,
    avatarState: 'thriving',
    mood: 'thriving',
    streakCounted: true,
    streakLength: 1,
    finalized: true,
  };
}

describe('buildDailyScore', () => {
  it('no pet: pet zeros, petScore 0, combined = humanScore', () => {
    const s = buildDailyScore({
      dayKey: '2026-09-12',
      todayKey: '2026-09-12',
      hour: 12,
      consumedKcal: 2000,
      consumedProteinG: 130,
      targetKcal: 2100,
      targetProteinG: 130,
      hasPet: false,
      fedGrams: 0,
      targetGrams: 0,
      fedKcal: 0,
      targetKcalPet: 0,
      priorRows: [],
    });
    const h = humanScore(2000, 2100, 130, 130);
    expect(s.pet.score).toBe(0);
    expect(s.combined).toBe(h);
    expect(s.streakCounted).toBe(false);
  });

  it('two default Biscuit meals → pet 100; past day mood equals avatarState', () => {
    const s = buildDailyScore({
      dayKey: '2026-09-11',
      todayKey: '2026-09-12',
      hour: null,
      consumedKcal: 2000,
      consumedProteinG: 130,
      targetKcal: 2100,
      targetProteinG: 130,
      hasPet: true,
      fedGrams: 132,
      targetGrams: 132,
      fedKcal: 452,
      targetKcalPet: 452,
      priorRows: [counted('2026-09-10')],
    });
    expect(s.pet.score).toBe(100);
    expect(s.mood).toBe(s.avatarState);
    expect(s.finalized).toBe(true);
    expect(s.streakCounted).toBe(true);
  });
});

vi.mock('../../src/db/models/user', () => ({ User: { findById: vi.fn() } }));
vi.mock('../../src/db/models/pet', () => ({ Pet: { findById: vi.fn() } }));
vi.mock('../../src/db/models/meal', () => ({ Meal: { aggregate: vi.fn() } }));
vi.mock('../../src/db/models/feeding', () => ({ Feeding: { aggregate: vi.fn() } }));
vi.mock('../../src/db/models/dailyScore', () => ({
  DailyScore: { find: vi.fn(), findOneAndUpdate: vi.fn() },
}));

describe('recomputeDay', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('upserts a score and celebrate=true when streak flips on', async () => {
    const { User } = await import('../../src/db/models/user');
    const { Pet } = await import('../../src/db/models/pet');
    const { Meal } = await import('../../src/db/models/meal');
    const { Feeding } = await import('../../src/db/models/feeding');
    const { DailyScore } = await import('../../src/db/models/dailyScore');
    const oid = { toString: () => '64a000000000000000000001' };
    (User.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: oid,
      timezone: 'America/New_York',
      petId: '64a000000000000000000002',
      targets: { kcal: 2100, proteinG: 130 },
    });
    (Pet.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: oid,
      targets: { portionGramsPerDay: 132, kcal: 452 },
    });
    (Meal.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue([{ kcal: 2000, proteinG: 130 }]);
    (Feeding.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue([{ grams: 132, kcal: 452 }]);
    const prev = {
      toApi: () => ({
        ...counted('2026-09-12'),
        streakCounted: false,
        pet: { fedGrams: 0, targetGrams: 132, fedKcal: 0, targetKcal: 452, score: 0 },
        human: { consumedKcal: 2000, targetKcal: 2100, proteinG: 130, score: 91 },
      }),
    };
    (DailyScore.find as ReturnType<typeof vi.fn>).mockReturnValue({
      sort: () => ({ limit: async () => [prev] }),
    });
    (DailyScore.findOneAndUpdate as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const { recomputeDay } = await import('../../src/services/scoring/recomputeDay');
    const result = await recomputeDay('64a000000000000000000001', '2026-09-12');
    expect(result.score.pet.score).toBe(100);
    expect(result.celebrate).toBe(true);
    expect(DailyScore.findOneAndUpdate).toHaveBeenCalled();
  });
});
