import { MealPlanGenerateRequestSchema } from '@petplate/shared';
import { Hono } from 'hono';
import { authMiddleware, type AppEnv } from '../lib/auth';
import { rateLimit } from '../lib/rateLimit';
import { generateMealPlan } from '../services/mealplan/generate';

export const mealPlanRoutes = new Hono<AppEnv>();
mealPlanRoutes.use('*', authMiddleware);
mealPlanRoutes.use('*', rateLimit);

mealPlanRoutes.post('/generate', async (c) => {
  const body = MealPlanGenerateRequestSchema.parse(await c.req.json().catch(() => ({})));
  const force = c.req.query('force') === '1';
  const plan = await generateMealPlan(
    c.get('userId'),
    body.forDayKey,
    force,
    body.customInstructions ?? null,
  );
  return c.json({ plan });
});
