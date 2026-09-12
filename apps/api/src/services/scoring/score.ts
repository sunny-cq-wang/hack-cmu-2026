/** TODO(P3): replace with full ALGORITHMS §3 scoring + spec. */
import { SCORE_THRESHOLDS, type AvatarState } from '@petplate/shared';

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

export function humanScore(
  consumedKcal: number,
  targetKcal: number,
  consumedProteinG: number,
  targetProteinG: number,
): number {
  if (consumedKcal === 0) return 0;
  if (targetKcal <= 0) return 0;
  const pct = (consumedKcal / targetKcal) * 100;
  const kcalScore = clamp(100 - 2 * Math.abs(pct - 100), 0, 100);
  const proteinBonus = targetProteinG > 0 ? Math.min(10, 10 * (consumedProteinG / targetProteinG)) : 0;
  return Math.round(clamp(kcalScore * 0.9 + proteinBonus, 0, 100));
}

export function petScore(fedGrams: number, targetGrams: number): number {
  if (targetGrams <= 0) return 0;
  const pct = (fedGrams / targetGrams) * 100;
  return Math.round(clamp(100 - 2 * Math.abs(pct - 100), 0, 100));
}

export function combinedScore(human: number, pet: number, hasPet: boolean): number {
  if (!hasPet) return human;
  return Math.round(0.5 * human + 0.5 * pet);
}

export function avatarStateFor(combined: number): AvatarState {
  if (combined >= SCORE_THRESHOLDS.thriving) return 'thriving';
  if (combined >= SCORE_THRESHOLDS.okay) return 'okay';
  return 'drooping';
}

export function moodFor(opts: {
  hour: number;
  consumedKcal: number;
  targetKcal: number;
  fedGrams: number;
  targetGrams: number;
  hasPet: boolean;
}): AvatarState {
  const expectedFrac = clamp((opts.hour - 7) / 14, 0.15, 1);
  const pacedScore = (ratio: number): number => clamp(100 - 2 * Math.abs(ratio * 100 - 100), 0, 100);
  const pacedHuman =
    opts.targetKcal > 0 ? pacedScore(opts.consumedKcal / (opts.targetKcal * expectedFrac)) : 0;
  const pacedPet =
    opts.hasPet && opts.targetGrams > 0 ? pacedScore(opts.fedGrams / (opts.targetGrams * expectedFrac)) : pacedHuman;
  const moodCombined = opts.hasPet ? 0.5 * pacedHuman + 0.5 * pacedPet : pacedHuman;
  return avatarStateFor(moodCombined);
}
