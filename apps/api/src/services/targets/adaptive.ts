import {
  ADAPTIVE_OFFSET_CLAMP,
  ADAPTIVE_PCT_CLAMP,
  ADJUST_COOLDOWN_DAYS,
  CAT_VET_FLAG_PCT,
  HUMAN_WEEKLY_TARGETS,
  PET_FAST_STEP_PCT,
  PET_MAINTAIN_STEP_PCT,
  PET_SLOW_STEP_PCT,
  PET_WEEKLY_TARGETS,
  WEIGHIN_MIN_SPAN_DAYS,
  WEIGHIN_WINDOW_DAYS,
  type Adjustment,
  type HumanProfile,
  type PetInput,
  type Trend,
} from '@petplate/shared';
import { addDays, format } from 'date-fns';
import { clamp } from './human';
import { computeHumanTargets } from './human';
import { computePetTargets, derivePetGoal } from './pet';

export type WeighPoint = { weighedAt: string | Date; weightKg: number };

type Parsed = { at: Date; kg: number };

function parsePoints(weighIns: WeighPoint[], windowDays: number, now?: Date): Parsed[] {
  const parsed = weighIns
    .map((p) => ({ at: new Date(p.weighedAt), kg: p.weightKg }))
    .filter((p) => !Number.isNaN(p.at.getTime()))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  if (parsed.length === 0) return [];
  const end = now ?? parsed[parsed.length - 1].at;
  const cutoff = end.getTime() - windowDays * 86400000;
  return parsed.filter((p) => p.at.getTime() >= cutoff - 1);
}

function leastSquaresSlopePerDay(points: Parsed[]): number | null {
  if (points.length < 2) return null;
  const t0 = points[0].at.getTime();
  const xs = points.map((p) => (p.at.getTime() - t0) / 86400000);
  const ys = points.map((p) => p.kg);
  const span = xs[xs.length - 1]! - xs[0]!;
  if (span < WEIGHIN_MIN_SPAN_DAYS) return null;
  const n = points.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    const x = xs[i]!;
    const y = ys[i]!;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }
  const den = n * sumXX - sumX * sumX;
  if (den === 0) return null;
  return (n * sumXY - sumX * sumY) / den;
}

export function weeklyChangePct(weighIns: WeighPoint[], windowDays = WEIGHIN_WINDOW_DAYS, now?: Date): number | null {
  const points = parsePoints(weighIns, windowDays, now);
  const slope = leastSquaresSlopePerDay(points);
  if (slope === null) return null;
  const latestKg = points[points.length - 1]!.kg;
  if (latestKg === 0) return null;
  return (slope * 7 * 100) / latestKg;
}

export function weeklyChangeKg(weighIns: WeighPoint[], windowDays = WEIGHIN_WINDOW_DAYS, now?: Date): number | null {
  const points = parsePoints(weighIns, windowDays, now);
  const slope = leastSquaresSlopePerDay(points);
  if (slope === null) return null;
  return slope * 7;
}

function recentlyAdjusted(lastAdjustedAt: string | null, now: Date): boolean {
  if (!lastAdjustedAt) return false;
  const last = new Date(lastAdjustedAt);
  return now.getTime() - last.getTime() < ADJUST_COOLDOWN_DAYS * 86400000;
}

function emptyAdj(before: Adjustment['before'], message: string, extra?: Partial<Adjustment>): Adjustment {
  return {
    applied: false,
    before,
    after: { ...before },
    observedWeeklyChangePct: extra?.observedWeeklyChangePct ?? null,
    targetWeeklyChangePct: extra?.targetWeeklyChangePct ?? null,
    message,
    vetFlag: extra?.vetFlag ?? false,
  };
}

export function adjustPet(args: {
  pet: PetInput;
  adaptivePct: number;
  lastAdjustedAt: string | null;
  weighIns: WeighPoint[];
  now?: Date;
}): Adjustment & { nextAdaptivePct: number } {
  const now = args.now ?? new Date();
  const current = computePetTargets({ ...args.pet, adaptivePct: args.adaptivePct });
  const before = { kcal: current.kcal, portionGramsPerDay: current.portionGramsPerDay };
  const species = args.pet.species === 'cat' ? 'cat' : 'dog';
  const goal = derivePetGoal(
    args.pet.species === 'virtual' ? 10 : args.pet.weightKg,
    args.pet.species === 'virtual' ? 10 : args.pet.idealWeightKg,
  );
  const band: [number, number] = goal === 'lose' ? [...PET_WEEKLY_TARGETS[species].lose] : [...PET_WEEKLY_TARGETS.maintain];
  const obs = weeklyChangePct(args.weighIns, WEIGHIN_WINDOW_DAYS, now);

  if (obs === null) {
    return { ...emptyAdj(before, 'Need one more weigh-in to adjust.', { targetWeeklyChangePct: band }), nextAdaptivePct: args.adaptivePct };
  }
  if (recentlyAdjusted(args.lastAdjustedAt, now)) {
    return {
      ...emptyAdj(before, 'adjusted recently', { observedWeeklyChangePct: obs, targetWeeklyChangePct: band }),
      nextAdaptivePct: args.adaptivePct,
    };
  }

  let next = args.adaptivePct;
  let vetFlag = false;
  if (goal === 'lose') {
    const [lower, upper] = band;
    if (obs > upper) next += PET_SLOW_STEP_PCT;
    else if (obs < lower) {
      next += PET_FAST_STEP_PCT;
      vetFlag = true;
    }
  } else {
    if (obs > band[1]) next -= PET_MAINTAIN_STEP_PCT;
    else if (obs < band[0]) next += PET_MAINTAIN_STEP_PCT;
  }
  if (species === 'cat' && obs < CAT_VET_FLAG_PCT) vetFlag = true;

  next = clamp(next, -ADAPTIVE_PCT_CLAMP, ADAPTIVE_PCT_CLAMP);
  if (next === args.adaptivePct && !vetFlag) {
    return {
      ...emptyAdj(before, 'Weight trend is on target. No portion change.', { observedWeeklyChangePct: obs, targetWeeklyChangePct: band }),
      nextAdaptivePct: args.adaptivePct,
    };
  }
  if (next === args.adaptivePct) {
    return {
      applied: false,
      before,
      after: { ...before },
      observedWeeklyChangePct: obs,
      targetWeeklyChangePct: band,
      message: vetFlag ? 'Weight is dropping quickly. Consider checking with your vet.' : 'No portion change.',
      vetFlag,
      nextAdaptivePct: args.adaptivePct,
    };
  }

  const afterTargets = computePetTargets({ ...args.pet, adaptivePct: next });
  const after = { kcal: afterTargets.kcal, portionGramsPerDay: afterTargets.portionGramsPerDay };
  const reduced = next < args.adaptivePct;
  const step = Math.abs(next - args.adaptivePct);
  const direction = reduced ? `reduced ${step}%` : `increased ${step}%`;
  const message = `${args.pet.name} lost ${obs.toFixed(1)}%/week; target is ${Math.abs(band[1])}–${Math.abs(band[0])}%. Portion ${direction} to ${after.portionGramsPerDay} g/day.`;
  return {
    applied: true,
    before,
    after,
    observedWeeklyChangePct: obs,
    targetWeeklyChangePct: band,
    message,
    vetFlag,
    nextAdaptivePct: next,
  };
}

export function adjustHuman(args: {
  profile: HumanProfile;
  adaptiveOffsetKcal: number;
  lastAdjustedAt: string | null;
  weighIns: WeighPoint[];
  now?: Date;
}): Adjustment & { nextOffset: number } {
  const now = args.now ?? new Date();
  const current = computeHumanTargets(args.profile, args.adaptiveOffsetKcal);
  const before = { kcal: current.kcal };
  const obsKg = weeklyChangeKg(args.weighIns, WEIGHIN_WINDOW_DAYS, now);
  const obsPct = weeklyChangePct(args.weighIns, WEIGHIN_WINDOW_DAYS, now);

  if (obsKg === null) {
    return { ...emptyAdj(before, 'Need one more weigh-in to adjust.'), nextOffset: args.adaptiveOffsetKcal };
  }
  if (recentlyAdjusted(args.lastAdjustedAt, now)) {
    return {
      ...emptyAdj(before, 'adjusted recently', { observedWeeklyChangePct: obsPct }),
      nextOffset: args.adaptiveOffsetKcal,
    };
  }

  let next = args.adaptiveOffsetKcal;
  const { loseSlowKg, loseFastKg, maintainAbsKg, gainSlowKg, gainFastKg, offsetStep } = HUMAN_WEEKLY_TARGETS;
  if (args.profile.goal === 'lose') {
    if (obsKg > loseSlowKg) next -= offsetStep;
    else if (obsKg < loseFastKg) next += offsetStep;
  } else if (args.profile.goal === 'maintain') {
    if (Math.abs(obsKg) > maintainAbsKg) next -= Math.sign(obsKg) * offsetStep;
  } else {
    if (obsKg < gainSlowKg) next += offsetStep;
    else if (obsKg > gainFastKg) next -= offsetStep;
  }

  next = clamp(next, -ADAPTIVE_OFFSET_CLAMP, ADAPTIVE_OFFSET_CLAMP);
  if (next === args.adaptiveOffsetKcal) {
    return {
      ...emptyAdj(before, 'Calorie target unchanged (already at the ±300 clamp or on track).', { observedWeeklyChangePct: obsPct }),
      nextOffset: args.adaptiveOffsetKcal,
    };
  }
  const afterTargets = computeHumanTargets(args.profile, next);
  const after = { kcal: afterTargets.kcal };
  const delta = next - args.adaptiveOffsetKcal;
  const message = `Weekly change ${obsKg.toFixed(1)} kg/week. Calorie target ${delta < 0 ? 'reduced' : 'increased'} by ${Math.abs(delta)} to ${after.kcal} kcal.`;
  return {
    applied: true,
    before,
    after,
    observedWeeklyChangePct: obsPct,
    targetWeeklyChangePct: null,
    message,
    vetFlag: false,
    nextOffset: next,
  };
}

export function trend(weighIns: WeighPoint[], targetKg: number, now?: Date): Trend {
  const when = now ?? new Date();
  const points = parsePoints(weighIns, WEIGHIN_WINDOW_DAYS, when);
  const slopePerDay = leastSquaresSlopePerDay(points);
  const slopeKgPerWeek = slopePerDay === null ? null : slopePerDay * 7;
  const mapped = (points.length ? points : parsePoints(weighIns, 3650, when)).map((p) => ({
    at: p.at.toISOString(),
    kg: p.kg,
  }));
  if (slopeKgPerWeek === null || points.length === 0) {
    return { points: mapped, slopeKgPerWeek, projectedGoalDate: null };
  }
  const latestKg = points[points.length - 1]!.kg;
  const towardLose = latestKg > targetKg && slopeKgPerWeek < 0;
  const towardGain = latestKg < targetKg && slopeKgPerWeek > 0;
  if (!towardLose && !towardGain) {
    return { points: mapped, slopeKgPerWeek, projectedGoalDate: null };
  }
  const weeks = Math.abs(latestKg - targetKg) / Math.abs(slopeKgPerWeek);
  const days = Math.round(weeks * 7);
  const projectedGoalDate = format(addDays(when, days), 'yyyy-MM-dd');
  return { points: mapped, slopeKgPerWeek, projectedGoalDate };
}
