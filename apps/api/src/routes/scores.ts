import { Hono } from 'hono';
import { DayKey, DailyScoreSchema } from '@petplate/shared';
import { z } from 'zod';
import { requireAuth, type AuthVars } from '../lib/auth';
import { AppError } from '../lib/errors';
import { DailyScore } from '../db/models/dailyScore';
import { User } from '../db/models/user';
import { dayKey, shiftDayKey } from '../lib/day';
import { callToApi } from '../db/models/serialize';

export const scoresRoutes = new Hono<AuthVars>();
scoresRoutes.use('*', requireAuth);

const QuerySchema = z.object({
  from: DayKey.optional(),
  to: DayKey.optional(),
});

scoresRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const user = await User.findById(userId);
  if (!user) throw new AppError('NOT_FOUND', 'User not found');
  const tz = user.timezone || 'America/New_York';
  const parsed = QuerySchema.parse({ from: c.req.query('from'), to: c.req.query('to') });
  const to = parsed.to ?? dayKey(new Date(), tz);
  const from = parsed.from ?? shiftDayKey(to, -59);
  if (from > to) throw new AppError('VALIDATION_ERROR', 'from must be ≤ to');
  const rows = await DailyScore.find({
    userId: user._id,
    dayKey: { $gte: from, $lte: to },
  })
    .sort({ dayKey: 1 })
    .limit(60);
  return c.json({ days: rows.map((r) => DailyScoreSchema.parse(callToApi(r))) });
});
