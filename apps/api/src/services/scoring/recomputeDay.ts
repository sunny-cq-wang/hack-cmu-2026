import { Types } from 'mongoose';
import {
  DailyScoreSchema,
  SCORE_THRESHOLDS,
  type DailyScore,
} from '@petplate/shared';
import { User } from '../../db/models/user';
import { Pet } from '../../db/models/pet';
import { Meal } from '../../db/models/meal';
import { Feeding } from '../../db/models/feeding';
import { DailyScore as DailyScoreModel } from '../../db/models/dailyScore';
import { AppError } from '../../lib/errors';
import { dayKey, localHour, shiftDayKey } from '../../lib/day';
import { avatarStateFor, combinedScore, expectedFrac, humanScore, moodFor, pacedScore, petScore } from './score';
import { streakLength } from './streak';
import { callToApi } from '../../db/models/serialize';

export type BuildDailyScoreInput = {
  dayKey: string;
  todayKey: string;
  hour: number | null;
  consumedKcal: number;
  consumedProteinG: number;
  targetKcal: number;
  targetProteinG: number;
  hasPet: boolean;
  fedGrams: number;
  targetGrams: number;
  fedKcal: number;
  targetKcalPet: number;
  priorRows: DailyScore[];
};

/**
 * No-pet policy: pet section is zeros, petScore = 0, combined = humanScore
 * (not averaged with 0). streakCounted still requires both ≥ 70, so pet-less
 * users never increment a streak in MVP.
 */
export function buildDailyScore(input: BuildDailyScoreInput): DailyScore {
  const h = humanScore(input.consumedKcal, input.targetKcal, input.consumedProteinG, input.targetProteinG);
  const p = input.hasPet ? petScore(input.fedGrams, input.targetGrams) : 0;
  const combined = input.hasPet ? combinedScore(h, p) : h;
  const avatarState = avatarStateFor(combined);
  let mood = avatarState;
  if (input.hour !== null) {
    if (input.hasPet) {
      mood = moodFor({
        hour: input.hour,
        consumedKcal: input.consumedKcal,
        targetKcal: input.targetKcal,
        fedGrams: input.fedGrams,
        targetGrams: input.targetGrams,
      });
    } else {
      const frac = expectedFrac(input.hour);
      const pacedHuman = input.targetKcal <= 0 ? 1 : input.consumedKcal / (input.targetKcal * frac);
      mood = avatarStateFor(pacedScore(pacedHuman));
    }
  }
  const streakCounted = h >= SCORE_THRESHOLDS.streak && p >= SCORE_THRESHOLDS.streak;
  const draft: DailyScore = {
    dayKey: input.dayKey,
    human: {
      consumedKcal: input.consumedKcal,
      targetKcal: input.targetKcal,
      proteinG: input.consumedProteinG,
      score: h,
    },
    pet: {
      fedGrams: input.hasPet ? input.fedGrams : 0,
      targetGrams: input.hasPet ? input.targetGrams : 0,
      fedKcal: input.hasPet ? input.fedKcal : 0,
      targetKcal: input.hasPet ? input.targetKcalPet : 0,
      score: p,
    },
    combined,
    avatarState,
    mood,
    streakCounted,
    streakLength: 0,
    finalized: input.dayKey < input.todayKey,
  };
  const others = input.priorRows.filter((r) => r.dayKey !== input.dayKey);
  draft.streakLength = streakLength([...others, draft], input.dayKey);
  return DailyScoreSchema.parse(draft);
}

export async function recomputeDay(userId: string, forDayKey: string): Promise<{ score: DailyScore; celebrate: boolean }> {
  const user = await User.findById(userId);
  if (!user) throw new AppError('NOT_FOUND', 404, 'User not found');
  const tz = user.timezone || 'America/New_York';
  const todayKey = dayKey(new Date(), tz);
  const pet = user.petId ? await Pet.findById(user.petId) : null;

  const userOid = user._id;
  const mealAgg = await Meal.aggregate<{ kcal: number; proteinG: number }>([
    { $match: { userId: userOid, dayKey: forDayKey } },
    { $group: { _id: null, kcal: { $sum: '$totals.kcal' }, proteinG: { $sum: '$totals.proteinG' } } },
  ]);
  const consumedKcal = mealAgg[0]?.kcal ?? 0;
  const consumedProteinG = mealAgg[0]?.proteinG ?? 0;

  let fedGrams = 0;
  let fedKcal = 0;
  if (pet) {
    const feedAgg = await Feeding.aggregate<{ grams: number; kcal: number }>([
      { $match: { petId: pet._id, dayKey: forDayKey } },
      { $group: { _id: null, grams: { $sum: '$grams' }, kcal: { $sum: '$kcal' } } },
    ]);
    fedGrams = feedAgg[0]?.grams ?? 0;
    fedKcal = feedAgg[0]?.kcal ?? 0;
  }

  const from = shiftDayKey(forDayKey, -60);
  const priorDocs = await DailyScoreModel.find({
    userId: userOid,
    dayKey: { $gte: from, $lte: forDayKey },
  })
    .sort({ dayKey: -1 })
    .limit(60);
  const priorRows = priorDocs.map((d) => callToApi<DailyScore>(d));
  const previous = priorRows.find((r) => r.dayKey === forDayKey) ?? null;

  const hour = forDayKey === todayKey ? localHour(new Date(), tz) : null;
  const score = buildDailyScore({
    dayKey: forDayKey,
    todayKey,
    hour,
    consumedKcal,
    consumedProteinG,
    targetKcal: user.targets?.kcal ?? 0,
    targetProteinG: user.targets?.proteinG ?? 0,
    hasPet: Boolean(pet),
    fedGrams,
    targetGrams: pet?.targets?.portionGramsPerDay ?? 0,
    fedKcal,
    targetKcalPet: pet?.targets?.kcal ?? 0,
    priorRows,
  });

  const celebrate = previous?.streakCounted === false && score.streakCounted === true;

  await DailyScoreModel.findOneAndUpdate(
    { userId: userOid, dayKey: forDayKey },
    {
      $set: {
        userId: userOid instanceof Types.ObjectId ? userOid : new Types.ObjectId(String(userOid)),
        dayKey: score.dayKey,
        human: score.human,
        pet: score.pet,
        combined: score.combined,
        avatarState: score.avatarState,
        mood: score.mood,
        streakCounted: score.streakCounted,
        streakLength: score.streakLength,
        finalized: score.finalized,
      },
    },
    { upsert: true, new: true },
  );

  return { score, celebrate };
}
