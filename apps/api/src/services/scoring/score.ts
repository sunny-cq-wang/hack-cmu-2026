import {
  HUMAN_KCAL_WEIGHT,
  MOOD_DAY_LENGTH_HOURS,
  MOOD_DAY_START_HOUR,
  MOOD_FRAC_FLOOR,
  PROTEIN_BONUS_MAX,
  SCORE_PENALTY_PER_PCT,
  SCORE_THRESHOLDS,
  type AvatarState,
} from '@petplate/shared';
import { clamp } from '../targets/human.js';

export function kcalScore(consumed: number, target: number): number {
  if (target <= 0) return consumed === 0 ? 100 : 0;
  const pct = (consumed / target) * 100;
  return clamp(100 - SCORE_PENALTY_PER_PCT * Math.abs(pct - 100), 0, 100);
}

export function humanScore(
  consumedKcal: number,
  targetKcal: number,
  consumedProteinG: number,
  targetProteinG: number,
): number {
  if (consumedKcal === 0) return 0;
  const proteinBonus = targetProteinG <= 0 ? 0 : Math.min(PROTEIN_BONUS_MAX, PROTEIN_BONUS_MAX * (consumedProteinG / targetProteinG));
  return Math.round(clamp(kcalScore(consumedKcal, targetKcal) * HUMAN_KCAL_WEIGHT + proteinBonus, 0, 100));
}

export function petScore(fedGrams: number, targetGrams: number): number {
  if (targetGrams <= 0) return fedGrams === 0 ? 100 : 0;
  return Math.round(kcalScore(fedGrams, targetGrams));
}

export function combinedScore(human: number, pet: number): number {
  return Math.round(0.5 * human + 0.5 * pet);
}

export function avatarStateFor(combined: number): AvatarState {
  if (combined >= SCORE_THRESHOLDS.thriving) return 'thriving';
  if (combined >= SCORE_THRESHOLDS.okay) return 'okay';
  return 'drooping';
}

export function expectedFrac(hour: number): number {
  return clamp((hour - MOOD_DAY_START_HOUR) / MOOD_DAY_LENGTH_HOURS, MOOD_FRAC_FLOOR, 1);
}

export function pacedScore(ratio: number): number {
  return clamp(100 - SCORE_PENALTY_PER_PCT * Math.abs(ratio * 100 - 100), 0, 100);
}

export function moodFor(args: {
  hour: number;
  consumedKcal: number;
  targetKcal: number;
  fedGrams: number;
  targetGrams: number;
}): AvatarState {
  const frac = expectedFrac(args.hour);
  const pacedHuman = args.targetKcal <= 0 ? 1 : args.consumedKcal / (args.targetKcal * frac);
  const pacedPet = args.targetGrams <= 0 ? 1 : args.fedGrams / (args.targetGrams * frac);
  const moodCombined = 0.5 * pacedScore(pacedHuman) + 0.5 * pacedScore(pacedPet);
  return avatarStateFor(moodCombined);
}
