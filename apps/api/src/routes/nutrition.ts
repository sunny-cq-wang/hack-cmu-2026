import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware, type AppEnv } from '../lib/auth';
import { rateLimit } from '../lib/rateLimit';
import { computeGaps } from '../services/nutrition/gaps';

export const nutritionRoutes = new Hono<AppEnv>();
nutritionRoutes.use('*', authMiddleware);
nutritionRoutes.use('*', rateLimit);

nutritionRoutes.get('/gaps', async (c) => {
  const days = z.coerce.number().int().min(1).max(30).default(7).parse(c.req.query('days') ?? 7);
  const body = await computeGaps(c.get('userId'), days);
  return c.json(body);
});
