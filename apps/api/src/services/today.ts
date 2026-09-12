/**
 * `buildToday(userId)` — the /me/today payload.
 *
 * Reads stored `dailyScores` (AGENTS.md §8). Voice tools depend on
 * `compactFromToday` / `CompactToday`; the avatar pipeline depends on
 * `petAvatarToInfo`.
 */
import { emptyNutrients, TodaySummarySchema, type AvatarInfo, type TodaySummary } from '@petplate/shared';
import type { Pet as PetApi } from '@petplate/shared';
import { User } from '../db/models/user.js';
import { Pet } from '../db/models/pet.js';
import { DailyScore } from '../db/models/dailyScore.js';
import { Meal } from '../db/models/meal.js';
import { Feeding } from '../db/models/feeding.js';
import type { PetRecord } from '../db/types.js';
import { AppError } from '../lib/errors.js';
import { dayKey } from '../lib/day.js';
import { callToApi } from '../db/models/serialize.js';
import { urlFor } from './photos.js';

export function petAvatarToInfo(pet: PetRecord | null): AvatarInfo | null {
  if (!pet) return null;
  return {
    status: pet.avatar.status,
    neutralUrl: pet.avatar.neutralPhotoId ? urlFor(pet.avatar.neutralPhotoId) : null,
    thrivingUrl: pet.avatar.thrivingPhotoId ? urlFor(pet.avatar.thrivingPhotoId) : null,
    droopingUrl: pet.avatar.droopingPhotoId ? urlFor(pet.avatar.droopingPhotoId) : null,
    celebrationVideoUrl: pet.avatar.celebrationVideoUrl,
    voice: pet.avatar.voice,
  };
}

export async function buildToday(userId: string): Promise<TodaySummary> {
  const user = await User.findById(userId);
  if (!user) throw new AppError('NOT_FOUND', 'User not found');
  if (!user.profile) throw new AppError('ONBOARDING_REQUIRED', 'Complete onboarding first');

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

/** Compact context handed to the voice agent (P4 task file §6). */
export interface CompactToday {
  kcalRemaining: number;
  proteinRemaining: number;
  petFedGrams: number;
  petTargetGrams: number;
  topGaps: { label: string; pct: number }[];
}

export function compactFromToday(today: TodaySummary, topGaps: { label: string; pct: number }[]): CompactToday {
  return {
    kcalRemaining: Math.max(0, Math.round(today.human.targets.kcal - today.human.consumed.kcal)),
    proteinRemaining: Math.max(0, Math.round(today.human.targets.proteinG - today.human.consumed.proteinG)),
    petFedGrams: Math.round(today.pet?.fedGrams ?? 0),
    petTargetGrams: Math.round(today.pet?.targetGrams ?? 0),
    topGaps,
  };
}
