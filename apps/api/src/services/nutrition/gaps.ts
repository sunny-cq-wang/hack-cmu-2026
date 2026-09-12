import {
  GAP_THRESHOLD_PCT,
  GapsResponseSchema,
  MICRO_KEYS,
  NUTRIENT_LABELS,
  SUGGEST_FOODS,
  emptyNutrients,
  type GapsResponse,
  type Nutrients,
} from '@petplate/shared';
import { addDays, format, parseISO } from 'date-fns';
import { MealModel, UserModel } from '../../db/models';
import { dayKey } from '../../lib/day';
import { AppError } from '../../lib/errors';
import { sumNutrients } from './enrich';

const GAP_MICROS = MICRO_KEYS.filter((key) => key !== 'sodiumMg');

export function gapsFromAverages(
  avgIntake: Nutrients,
  micros: Partial<Nutrients>,
): GapsResponse['gaps'] {
  const rows = GAP_MICROS.flatMap((nutrient) => {
    const target = micros[nutrient];
    if (!target || target <= 0) return [];
    const pctOfTarget = (avgIntake[nutrient] / target) * 100;
    if (pctOfTarget >= GAP_THRESHOLD_PCT) return [];
    return [
      {
        nutrient,
        pctOfTarget: Math.round(pctOfTarget),
        label: NUTRIENT_LABELS[nutrient],
        suggestFoods: SUGGEST_FOODS[nutrient] ?? [],
      },
    ];
  });
  return rows.sort((a, b) => a.pctOfTarget - b.pctOfTarget).slice(0, 5);
}

export async function computeGaps(userId: string, days = 7): Promise<GapsResponse> {
  const user = await UserModel.findById(userId);
  if (!user?.profile || !user.targets) {
    throw new AppError('ONBOARDING_REQUIRED', 409, 'Complete your profile before viewing gaps');
  }
  const today = dayKey(new Date(), user.timezone);
  const keys: string[] = [];
  for (let i = 0; i < days; i += 1) {
    keys.push(format(addDays(parseISO(today), -i), 'yyyy-MM-dd'));
  }
  const meals = await MealModel.find({ userId: user._id, dayKey: { $in: keys } });
  const byDay = new Map<string, Nutrients[]>();
  for (const meal of meals) {
    const list = byDay.get(meal.dayKey) ?? [];
    list.push(meal.totals);
    byDay.set(meal.dayKey, list);
  }
  const dailyTotals = [...byDay.values()].map((list) => sumNutrients(list));
  const avgIntake = emptyNutrients();
  if (dailyTotals.length > 0) {
    const summed = sumNutrients(dailyTotals);
    const n = dailyTotals.length;
    (Object.keys(avgIntake) as (keyof Nutrients)[]).forEach((key) => {
      avgIntake[key] = summed[key] / n;
    });
  }

  return GapsResponseSchema.parse({
    days,
    avgIntake,
    targets: user.targets.micros ?? {},
    gaps: gapsFromAverages(avgIntake, user.targets.micros ?? {}),
  });
}
