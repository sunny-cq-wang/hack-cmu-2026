/**
 * TODO(P3): replace with the full ALGORITHMS §3.6 orchestrator (aggregations, 60-day streak query).
 * P2 calls this after meal writes and from GET /me/today when the row is missing.
 */
import { DailyScoreSchema, SCORE_THRESHOLDS, type DailyScore } from '@petplate/shared';
import { DailyScoreModel, FeedingModel, MealModel, PetModel, UserModel, type DailyScoreDoc } from '../../db/models';
import { dayKey as makeDayKey, localHour } from '../../lib/day';
import { AppError } from '../../lib/errors';
import { sumNutrients } from '../nutrition/enrich';
import { avatarStateFor, combinedScore, humanScore, moodFor, petScore } from './score';
import { streakLength } from './streak';

export async function recomputeDay(
  userId: string,
  dayKeyStr: string,
): Promise<{ score: DailyScore; celebrate: boolean }> {
  const user = await UserModel.findById(userId);
  if (!user) throw new AppError('NOT_FOUND', 404, 'User not found');

  const previous = await DailyScoreModel.findOne({ userId: user._id, dayKey: dayKeyStr });
  const meals = await MealModel.find({ userId: user._id, dayKey: dayKeyStr });
  const consumed = sumNutrients(meals.map((m) => m.totals));
  const pet = user.petId ? await PetModel.findById(user.petId) : null;
  const feedings = pet ? await FeedingModel.find({ petId: pet._id, dayKey: dayKeyStr }) : [];
  const fedGrams = feedings.reduce((sum, f) => sum + f.grams, 0);
  const fedKcal = feedings.reduce((sum, f) => sum + f.kcal, 0);

  const targetKcal = user.targets?.kcal ?? 0;
  const targetProteinG = user.targets?.proteinG ?? 0;
  const hScore = humanScore(consumed.kcal, targetKcal, consumed.proteinG, targetProteinG);
  const targetGrams = pet?.targets.portionGramsPerDay ?? 0;
  const targetPetKcal = pet?.targets.kcal ?? 0;
  const pScore = pet ? petScore(fedGrams, targetGrams) : 0;
  const combined = combinedScore(hScore, pScore, Boolean(pet));
  const avatarState = avatarStateFor(combined);

  const todayKey = makeDayKey(new Date(), user.timezone);
  const mood =
    dayKeyStr === todayKey
      ? moodFor({
          hour: localHour(new Date(), user.timezone),
          consumedKcal: consumed.kcal,
          targetKcal,
          fedGrams,
          targetGrams,
          hasPet: Boolean(pet),
        })
      : avatarState;

  const streakCounted =
    hScore >= SCORE_THRESHOLDS.streak && (pet ? pScore >= SCORE_THRESHOLDS.streak : false);
  const recent = await DailyScoreModel.find({ userId: user._id }).sort({ dayKey: -1 }).limit(60);
  const recentDocs = recent as DailyScoreDoc[];
  const nextRow: DailyScore = DailyScoreSchema.parse({
    dayKey: dayKeyStr,
    human: {
      consumedKcal: consumed.kcal,
      targetKcal,
      proteinG: consumed.proteinG,
      score: hScore,
    },
    pet: {
      fedGrams,
      targetGrams,
      fedKcal,
      targetKcal: targetPetKcal,
      score: pScore,
    },
    combined,
    avatarState,
    mood,
    streakCounted,
    streakLength: 0,
    finalized: dayKeyStr < todayKey,
  });
  const length = streakLength(
    [...recentDocs.filter((r) => r.dayKey !== dayKeyStr).map((r) => r.toApi()), nextRow],
    todayKey,
  );
  nextRow.streakLength = length;

  const saved = await DailyScoreModel.findOneAndUpdate(
    { userId: user._id, dayKey: dayKeyStr },
    { $set: { ...nextRow, userId: user._id } },
    { upsert: true, new: true },
  );
  if (!saved) throw new AppError('INTERNAL', 500, 'Failed to upsert daily score');

  const score = (saved as DailyScoreDoc).toApi();
  const celebrate = previous?.streakCounted === false && score.streakCounted === true;
  return { score, celebrate: Boolean(celebrate) };
}

export { avatarStateFor, combinedScore, humanScore, petScore };
export type { DailyScore };
