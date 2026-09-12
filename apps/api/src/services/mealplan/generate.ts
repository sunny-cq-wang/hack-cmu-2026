import {
  GAP_THRESHOLD_PCT,
  MealPlanProposalSchema,
  MealPlanSchema,
  type MealPlan,
  type MealPlanProposal,
  type Nutrients,
} from '@petplate/shared';
import { addDays, format, parseISO } from 'date-fns';
import { MealPlanModel, UserModel, type MealPlanDoc } from '../../db/models';
import { isDemo } from '../../config';
import { dayKey } from '../../lib/day';
import { AppError } from '../../lib/errors';
import { log } from '../../lib/log';
import { CANNED_MEAL_PLAN } from '../demo/cannedPlan';
import { grokJson } from '../grok/chat';
import { enrichItems, sumNutrients } from '../nutrition/enrich';
import { computeGaps } from '../nutrition/gaps';

const SYSTEM =
  'You are a registered-dietitian-style meal planner. Propose exactly 3 meals (breakfast, lunch, dinner) for one day. Total calories must be within 10% of TARGET_KCAL. Prioritize whole foods rich in the listed GAP nutrients. Respect PREFS and never include ALLERGIES. Each meal: a title and 3–7 ingredient lines with grams and a usdaQuery (2–4 words matching USDA Foundation/SR Legacy names). Output JSON only.';

const PROPOSAL_JSON_SCHEMA = {
  type: 'object',
  properties: {
    meals: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          slot: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
          title: { type: 'string' },
          ingredientLines: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                grams: { type: 'number' },
                usdaQuery: { type: 'string' },
              },
              required: ['name', 'grams', 'usdaQuery'],
              additionalProperties: false,
            },
          },
        },
        required: ['slot', 'title', 'ingredientLines'],
        additionalProperties: false,
      },
    },
  },
  required: ['meals'],
  additionalProperties: false,
};

function verifyPlan(
  dayTotals: Nutrients,
  remainingKcal: number,
  gaps: { nutrient: string; pctOfTarget: number }[],
  micros: Partial<Nutrients>,
): { ok: boolean; feedback: string[] } {
  const feedback: string[] = [];
  const tol = remainingKcal * 0.1;
  if (Math.abs(dayTotals.kcal - remainingKcal) > tol) {
    feedback.push(`Day total ${Math.round(dayTotals.kcal)} kcal exceeds ${Math.round(remainingKcal)} ±10%`);
  }
  for (const gap of gaps) {
    const nutrient = gap.nutrient as keyof Nutrients;
    const target = micros[nutrient];
    if (!target) continue;
    const got = dayTotals[nutrient] ?? 0;
    if (got / target * 100 < GAP_THRESHOLD_PCT) {
      feedback.push(`${String(nutrient)} only ${Math.round(got)} g of ${target} g target`);
    }
  }
  return { ok: feedback.length === 0, feedback };
}

async function propose(userJson: string): Promise<MealPlanProposal> {
  try {
    return await grokJson({
      system: SYSTEM,
      user: userJson,
      schema: MealPlanProposalSchema,
      timeoutMs: 20000,
      jsonSchemaName: 'MealPlanProposal',
      jsonSchema: PROPOSAL_JSON_SCHEMA,
    });
  } catch (err) {
    if (isDemo) {
      log.warn({ err }, 'meal plan falling back to canned proposal');
      return CANNED_MEAL_PLAN;
    }
    throw new AppError('UPSTREAM_ERROR', 502, 'Meal plan generation failed');
  }
}

async function enrichProposal(proposal: MealPlanProposal): Promise<{
  meals: MealPlan['meals'];
  dayTotals: Nutrients;
}> {
  const meals = [];
  for (const meal of proposal.meals) {
    const items = await enrichItems(
      meal.ingredientLines.map((line) => ({
        name: line.name,
        grams: line.grams,
        usdaQuery: line.usdaQuery,
      })),
    );
    meals.push({
      slot: meal.slot,
      title: meal.title,
      ingredientLines: meal.ingredientLines.map((line) => ({ name: line.name, grams: line.grams })),
      nutrients: sumNutrients(items.map((item) => item.nutrients)),
    });
  }
  return { meals, dayTotals: sumNutrients(meals.map((m) => m.nutrients)) };
}

export async function generateMealPlan(
  userId: string,
  forDayKey: string | undefined,
  force: boolean,
): Promise<MealPlan> {
  const user = await UserModel.findById(userId);
  if (!user?.profile || !user.targets) {
    throw new AppError('ONBOARDING_REQUIRED', 409, 'Complete your profile before generating a plan');
  }
  const today = dayKey(new Date(), user.timezone);
  const targetDay = forDayKey ?? format(addDays(parseISO(today), 1), 'yyyy-MM-dd');

  if (!force) {
    const existing = await MealPlanModel.findOne({ userId: user._id, forDayKey: targetDay, verified: true });
    if (existing) return (existing as MealPlanDoc).toApi();
  }

  const gapsRes = await computeGaps(userId, 7);
  const remainingKcal = user.targets.kcal;
  const gapPayload = gapsRes.gaps.map((g) => ({
    nutrient: g.nutrient,
    pctOfTarget: g.pctOfTarget,
    label: g.label,
  }));

  let best: { meals: MealPlan['meals']; dayTotals: Nutrients; verified: boolean; attempts: number } | null = null;
  let feedback: string[] = [];

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const userJson = JSON.stringify({
      targetKcal: remainingKcal,
      proteinTargetG: user.targets.proteinG,
      gaps: gapPayload,
      prefs: user.profile.dietaryPrefs,
      allergies: user.profile.allergies,
      feedback: feedback.length ? feedback : undefined,
    });
    const proposal = await propose(userJson);
    const enriched = await enrichProposal(proposal);
    const check = verifyPlan(enriched.dayTotals, remainingKcal, gapPayload, user.targets.micros ?? {});
    best = { ...enriched, verified: check.ok, attempts: attempt };
    if (check.ok) break;
    feedback = check.feedback;
    log.info({ attempt, feedback }, 'meal plan verify failed');
  }

  if (!best) throw new AppError('INTERNAL', 500, 'Meal plan generation produced no result');

  const doc = await MealPlanModel.findOneAndUpdate(
    { userId: user._id, forDayKey: targetDay },
    {
      $set: {
        userId: user._id,
        forDayKey: targetDay,
        gaps: gapPayload.map((g) => ({ nutrient: g.nutrient, pctOfTarget: g.pctOfTarget })),
        meals: best.meals,
        dayTotals: best.dayTotals,
        verified: best.verified,
        attempts: best.attempts,
      },
    },
    { upsert: true, new: true },
  );
  if (!doc) throw new AppError('INTERNAL', 500, 'Failed to save meal plan');
  return (doc as MealPlanDoc).toApi();
}
