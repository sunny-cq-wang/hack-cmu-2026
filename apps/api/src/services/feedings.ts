/**
 * Shared feeding write path used by POST /pets/:id/feedings and the voice
 * `log_feeding` tool so both stay on P3's models + recomputeDay.
 */
import type { TodaySummary } from '@petplate/shared';
import { Feeding } from '../db/models/feeding.js';
import { Pet } from '../db/models/pet.js';
import { User } from '../db/models/user.js';
import { AppError } from '../lib/errors.js';
import { dayKey } from '../lib/day.js';
import { recomputeDay } from './scoring/recomputeDay.js';
import { buildToday } from './today.js';

export interface LogFeedingResult {
  logged: true;
  grams: number;
  kcal: number;
  today: TodaySummary;
  feeding: InstanceType<typeof Feeding>;
}

export async function logFeeding(
  userId: string,
  grams?: number,
  source: 'tap' | 'voice' = 'tap',
  petId?: string,
  fedAtInput?: Date,
): Promise<LogFeedingResult> {
  const user = await User.findById(userId);
  if (!user) throw new AppError('NOT_FOUND', 'User not found');
  const resolvedPetId = petId ?? (user.petId ? String(user.petId) : null);
  if (!resolvedPetId) throw new AppError('NOT_FOUND', 'No pet on this account yet');
  const pet = await Pet.findById(resolvedPetId);
  if (!pet || String(pet.userId) !== userId) throw new AppError('NOT_FOUND', 'Pet not found');

  const meals = pet.targets?.mealsPerDay ?? pet.mealsPerDay ?? 2;
  const portion = pet.targets?.portionGramsPerDay ?? 0;
  const finalGrams = grams && grams > 0 ? Math.round(grams) : Math.round(portion / meals);
  if (!(finalGrams > 0)) throw new AppError('VALIDATION_ERROR', 'grams must be > 0');
  const kcalPerGram = (pet.food?.kcalPerCup ?? 375) / (pet.food?.gramsPerCup ?? 110);
  const kcal = finalGrams * kcalPerGram;
  const tz = user.timezone || 'America/New_York';
  const fedAt = fedAtInput ?? new Date();
  const feeding = await Feeding.create({
    petId: pet._id,
    userId: user._id,
    fedAt,
    dayKey: dayKey(fedAt, tz),
    grams: finalGrams,
    kcal,
    source,
  });
  await recomputeDay(userId, dayKey(fedAt, tz));
  return {
    logged: true,
    grams: finalGrams,
    kcal,
    today: await buildToday(userId),
    feeding,
  };
}
