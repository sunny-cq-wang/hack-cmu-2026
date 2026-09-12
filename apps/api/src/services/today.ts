import { emptyNutrients, TodaySummarySchema, type TodaySummary } from '@petplate/shared';
import { User } from '../db/models/user';
import { Pet } from '../db/models/pet';
import { DailyScore } from '../db/models/dailyScore';
import { Meal } from '../db/models/meal';
import { Feeding } from '../db/models/feeding';
import { AppError } from '../lib/errors';
import { dayKey } from '../lib/day';
import { callToApi } from '../db/models/serialize';
import type { Pet as PetApi } from '@petplate/shared';

// TODO(P2): replace — exact signature: buildToday(userId: string): Promise<TodaySummary>
// Assembles TodaySummary from users, pets, dailyScores, and adjustmentLog (last 3).

export async function buildToday(userId: string): Promise<TodaySummary> {
  const user = await User.findById(userId);
  if (!user) throw new AppError('NOT_FOUND', 404, 'User not found');
  if (!user.profile) throw new AppError('ONBOARDING_REQUIRED', 409, 'Complete onboarding first');

  const tz = user.timezone || 'America/New_York';
  const today = dayKey(new Date(), tz);
  const score = await DailyScore.findOne({ userId: user._id, dayKey: today });
  const pet = user.petId ? await Pet.findById(user.petId) : null;

  const userLog = Array.isArray(user.targets?.adjustmentLog) ? user.targets.adjustmentLog : [];
  const petLog = Array.isArray(pet?.targets?.adjustmentLog) ? pet.targets.adjustmentLog : [];
  const adjustments = [...userLog, ...petLog]
    .map((a: { subject: 'user' | 'pet'; message: string; at: Date | string }) => ({
      subject: a.subject,
      message: a.message,
      at: typeof a.at === 'string' ? a.at : new Date(a.at).toISOString(),
    }))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 3);

  const petApi = pet ? callToApi<PetApi>(pet) : null;
  const mealsLogged = await Meal.countDocuments({ userId: user._id, dayKey: today });
  const feedingsToday = pet ? await Feeding.countDocuments({ petId: pet._id, dayKey: today }) : 0;
  const consumed = emptyNutrients();
  consumed.kcal = score?.human?.consumedKcal ?? 0;
  consumed.proteinG = score?.human?.proteinG ?? 0;

  const payload: TodaySummary = {
    dayKey: today,
    human: {
      consumed,
      targets: {
        kcal: user.targets?.kcal ?? 0,
        proteinG: user.targets?.proteinG ?? 0,
        carbsG: user.targets?.carbsG ?? 0,
        fatG: user.targets?.fatG ?? 0,
      },
      score: score?.human?.score ?? 0,
      mealsLogged,
    },
    pet: petApi
      ? {
          petId: petApi.id,
          name: petApi.name,
          species: petApi.species,
          fedGrams: score?.pet?.fedGrams ?? 0,
          targetGrams: score?.pet?.targetGrams ?? petApi.targets.portionGramsPerDay,
          fedKcal: score?.pet?.fedKcal ?? 0,
          targetKcal: score?.pet?.targetKcal ?? petApi.targets.kcal,
          feedingsToday,
          mealsPerDay: petApi.targets.mealsPerDay,
          score: score?.pet?.score ?? 0,
        }
      : null,
    combined: score?.combined ?? 0,
    avatarState: score?.avatarState ?? 'drooping',
    mood: score?.mood ?? 'drooping',
    streak: {
      length: score?.streakLength ?? 0,
      todayCounted: score?.streakCounted ?? false,
      bothAboveThreshold: score?.streakCounted ?? false,
    },
    avatar: petApi?.avatar ?? null,
    adjustments,
  };

  return TodaySummarySchema.parse(payload);
}
