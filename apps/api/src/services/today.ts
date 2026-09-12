/**
 * `buildToday(userId)` — the /me/today payload.
 *
 * TODO(P2/P3): P2 owns this and P3 owns the scoring services. This implements
 * ALGORITHMS.md §3.1–3.5 directly so P4's avatar and voice flows have real
 * numbers to react to. Replace with `dailyScores` reads + P3's scoring once they
 * land; keep the `buildToday` signature, which voice `tools.ts` depends on.
 */
import {
  emptyNutrients,
  TodaySummarySchema,
  type AvatarInfo,
  type AvatarState,
  type TodaySummary,
} from '@petplate/shared';
import { store as db } from '../db/connect.js';
import { dayKey, localHour } from '../lib/day.js';
import type { PetRecord } from '../db/types.js';
import { urlFor } from './photos.js';

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const pointScore = (ratio: number): number => clamp(100 - 2 * Math.abs(ratio * 100 - 100), 0, 100);
const stateFor = (combined: number): AvatarState =>
  combined >= 80 ? 'thriving' : combined >= 50 ? 'okay' : 'drooping';

// TODO(P2): read from users.targets once the profile flow exists.
const FALLBACK_HUMAN_TARGETS = { kcal: 2100, proteinG: 130, carbsG: 236, fatG: 58 };

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
  const user = await db.findUserById(userId);
  const timezone = user?.timezone ?? 'America/New_York';
  const key = dayKey(new Date(), timezone);
  const pet = await db.findPetByUserId(userId);

  const meals = await db.mealsForDay(userId, key);
  const consumedKcal = meals.reduce((sum, m) => sum + m.kcal, 0);
  const consumedProteinG = meals.reduce((sum, m) => sum + m.proteinG, 0);

  const consumed = emptyNutrients();
  consumed.kcal = consumedKcal;
  consumed.proteinG = consumedProteinG;

  // §3.1 human score
  const kcalScore = consumedKcal === 0 ? 0 : pointScore(consumedKcal / FALLBACK_HUMAN_TARGETS.kcal);
  const proteinBonus = Math.min(10, (10 * consumedProteinG) / FALLBACK_HUMAN_TARGETS.proteinG);
  const humanScore = consumedKcal === 0 ? 0 : Math.round(clamp(kcalScore * 0.9 + proteinBonus, 0, 100));

  // §3.2 pet score
  const feedings = pet ? await db.feedingsForDay(pet.id, key) : [];
  const fedGrams = feedings.reduce((sum, f) => sum + f.grams, 0);
  const fedKcal = feedings.reduce((sum, f) => sum + f.kcal, 0);
  const targetGrams = pet?.targets?.portionGramsPerDay ?? 0;
  const targetPetKcal = pet?.targets?.kcal ?? 0;
  const petScore = !pet || targetGrams <= 0 ? 0 : Math.round(pointScore(fedGrams / targetGrams));

  // §3.3 combined
  const combined = pet
    ? Math.round(0.5 * humanScore + 0.5 * petScore)
    : Math.round(humanScore);
  const avatarState = stateFor(combined);

  // §3.5 intraday mood
  const expectedFrac = clamp((localHour(new Date(), timezone) - 7) / 14, 0.15, 1);
  const pacedHuman = pointScore(consumedKcal / (FALLBACK_HUMAN_TARGETS.kcal * expectedFrac));
  const pacedPet = !pet || targetGrams <= 0 ? 0 : pointScore(fedGrams / (targetGrams * expectedFrac));
  const moodCombined = pet ? 0.5 * pacedHuman + 0.5 * pacedPet : pacedHuman;
  const mood = stateFor(moodCombined);

  const bothAboveThreshold = humanScore >= 70 && petScore >= 70;

  return TodaySummarySchema.parse({
    dayKey: key,
    human: {
      consumed,
      targets: FALLBACK_HUMAN_TARGETS,
      score: humanScore,
      mealsLogged: meals.length,
    },
    pet: pet
      ? {
          petId: pet.id,
          name: pet.name,
          species: pet.species,
          fedGrams,
          targetGrams,
          fedKcal,
          targetKcal: targetPetKcal,
          feedingsToday: feedings.length,
          mealsPerDay: pet.mealsPerDay,
          score: petScore,
        }
      : null,
    combined,
    avatarState,
    mood,
    // TODO(P3): real streak from dailyScores; today-only until then.
    streak: { length: bothAboveThreshold ? 1 : 0, todayCounted: bothAboveThreshold, bothAboveThreshold },
    avatar: petAvatarToInfo(pet),
    adjustments: [],
  });
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
