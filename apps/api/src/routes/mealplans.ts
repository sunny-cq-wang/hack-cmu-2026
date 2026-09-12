import { DayKey } from '@petplate/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware, type AppEnv } from '../lib/auth';
import { rateLimit } from '../lib/rateLimit';
import { generateMealPlan } from '../services/mealplan/generate';

export const mealPlanRoutes = new Hono<AppEnv>();
mealPlanRoutes.use('*', authMiddleware);
mealPlanRoutes.use('*', rateLimit);

const GenerateSchema = z.object({
  forDayKey: DayKey.optional(),
});

mealPlanRoutes.post('/generate', async (c) => {
  const body = GenerateSchema.parse(await c.req.json().catch(() => ({})));
  const force = c.req.query('force') === '1';
  const plan = await generateMealPlan(c.get('userId'), body.forDayKey, force);
  return c.json({ plan });
});
