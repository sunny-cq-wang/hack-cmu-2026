import { emptyNutrients, TodaySummarySchema, type TodaySummary } from '@petplate/shared';
import { User } from '../db/models/user';
import { Pet } from '../db/models/pet';
import { DailyScore } from '../db/models/dailyScore';
import { AppError } from '../lib/errors';
import { dayKey } from '../lib/day';

// TODO(P2): replace — exact signature: buildToday(userId: string): Promise<TodaySummary>
// Assembles TodaySummary from users, pets, dailyScores, and adjustmentLog (last 3).
// P2 also calls recomputeDay when today's row is missing; this stub reads the stored row only.

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
      at: typeof a.at === 'string' ? a.at : a.at.toISOString(),
    }))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 3);

  const petApi = pet?.toApi();
  const payload: TodaySummary = {
    dayKey: today,
    human: {
      consumed: emptyNutrients(),
      targets: {
        kcal: user.targets?.kcal ?? 0,
        proteinG: user.targets?.proteinG ?? 0,
        carbsG: user.targets?.carbsG ?? 0,
        fatG: user.targets?.fatG ?? 0,
      },
      score: score?.human.score ?? 0,
      mealsLogged: 0,
    },
    pet: petApi
      ? {
          petId: petApi.id,
          name: petApi.name,
          species: petApi.species,
          fedGrams: score?.pet.fedGrams ?? 0,
          targetGrams: score?.pet.targetGrams ?? petApi.targets.portionGramsPerDay,
          fedKcal: score?.pet.fedKcal ?? 0,
          targetKcal: score?.pet.targetKcal ?? petApi.targets.kcal,
          feedingsToday: 0,
          mealsPerDay: petApi.targets.mealsPerDay,
          score: score?.pet.score ?? 0,
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
