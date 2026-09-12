/**
 * P3 stub — the feeding write path. Real home: routes/pets.ts + scoring.recomputeDay.
 * P4's voice `log_feeding` tool calls this so both paths stay identical when P3 lands.
 */
import type { TodaySummary } from '@petplate/shared';
import { store as db } from '../db/connect.js';
import { dayKey } from '../lib/day.js';
import { AppError } from '../lib/errors.js';
import { buildToday } from '../services/today.js';

export interface LogFeedingResult {
  logged: true;
  grams: number;
  kcal: number;
  today: TodaySummary;
}

export async function logFeeding(
  userId: string,
  grams?: number,
  source: 'tap' | 'voice' = 'tap',
): Promise<LogFeedingResult> {
  const user = await db.findUserById(userId);
  const pet = await db.findPetByUserId(userId);
  if (!pet) throw new AppError('NOT_FOUND', 'No pet on this account yet');

  const perMeal = Math.round(pet.targets.portionGramsPerDay / Math.max(1, pet.targets.mealsPerDay));
  const finalGrams = grams && grams > 0 ? Math.round(grams) : perMeal;
  const kcalPerGram = pet.food.kcalPerCup / pet.food.gramsPerCup;
  const fedAt = new Date();

  await db.createFeeding({
    petId: pet.id,
    userId,
    fedAt: fedAt.toISOString(),
    dayKey: dayKey(fedAt, user?.timezone),
    grams: finalGrams,
    kcal: Math.round(finalGrams * kcalPerGram),
    source,
  });

  // TODO(P3): call scoring.recomputeDay here and persist a dailyScores row.
  return {
    logged: true,
    grams: finalGrams,
    kcal: Math.round(finalGrams * kcalPerGram),
    today: await buildToday(userId),
  };
}
