import {
  TodaySummarySchema,
  emptyNutrients,
  type TodaySummary,
} from '@petplate/shared';
import { MealModel, PetModel, UserModel, DailyScoreModel, FeedingModel } from '../db/models';
import { photoUrl } from '../db/models/helpers';
import { dayKey } from '../lib/day';
import { AppError } from '../lib/errors';
import { sumNutrients } from './nutrition/enrich';
import { recomputeDay } from './scoring';

export async function buildToday(userId: string): Promise<TodaySummary> {
  const user = await UserModel.findById(userId);
  if (!user) throw new AppError('NOT_FOUND', 404, 'User not found');
  if (!user.profile) {
    throw new AppError('ONBOARDING_REQUIRED', 409, 'Complete your profile before viewing today');
  }

  const key = dayKey(new Date(), user.timezone);
  let row = await DailyScoreModel.findOne({ userId: user._id, dayKey: key });
  if (!row) {
    await recomputeDay(userId, key);
    row = await DailyScoreModel.findOne({ userId: user._id, dayKey: key });
  }
  if (!row) throw new AppError('INTERNAL', 500, 'Failed to load today score');

  const pet = user.petId ? await PetModel.findById(user.petId) : null;
  const meals = await MealModel.find({ userId: user._id, dayKey: key });
  const consumed = meals.length ? sumNutrients(meals.map((m) => m.totals)) : emptyNutrients();
  const feedings = pet ? await FeedingModel.find({ petId: pet._id, dayKey: key }) : [];

  const userLog = user.targets?.adjustmentLog ?? [];
  const petLog = pet?.targets.adjustmentLog ?? [];
  const adjustments = [...userLog.map((e) => ({ ...e, subject: 'user' as const })), ...petLog.map((e) => ({ ...e, subject: 'pet' as const }))]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 3)
    .map((e) => ({
      subject: e.subject,
      message: e.message,
      at: e.at instanceof Date ? e.at.toISOString() : new Date(e.at).toISOString(),
    }));

  return TodaySummarySchema.parse({
    dayKey: key,
    human: {
      consumed,
      targets: {
        kcal: user.targets?.kcal ?? 0,
        proteinG: user.targets?.proteinG ?? 0,
        carbsG: user.targets?.carbsG ?? 0,
        fatG: user.targets?.fatG ?? 0,
      },
      score: row.human.score,
      mealsLogged: meals.length,
    },
    pet: pet
      ? {
          petId: pet._id.toString(),
          name: pet.name,
          species: pet.species,
          fedGrams: row.pet.fedGrams,
          targetGrams: row.pet.targetGrams,
          fedKcal: row.pet.fedKcal,
          targetKcal: row.pet.targetKcal,
          feedingsToday: feedings.length,
          mealsPerDay: pet.targets.mealsPerDay ?? pet.mealsPerDay,
          score: row.pet.score,
        }
      : null,
    combined: row.combined,
    avatarState: row.avatarState,
    mood: row.mood,
    streak: {
      length: row.streakLength,
      todayCounted: row.streakCounted,
      bothAboveThreshold: row.streakCounted,
    },
    avatar: pet
      ? {
          status: pet.avatar.status,
          neutralUrl: photoUrl(pet.avatar.neutralPhotoId),
          thrivingUrl: photoUrl(pet.avatar.thrivingPhotoId),
          droopingUrl: photoUrl(pet.avatar.droopingPhotoId),
          celebrationVideoUrl: pet.avatar.celebrationVideoUrl ?? null,
          voice: pet.avatar.voice ?? 'Ara',
        }
      : null,
    adjustments,
  });
}
