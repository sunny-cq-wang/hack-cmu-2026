import { HumanProfileSchema } from '@petplate/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { WeighInModel, type StoredHumanTargets } from '../db/models';
import { authMiddleware, type AppEnv } from '../lib/auth';
import { dayKey } from '../lib/day';
import { rateLimit } from '../lib/rateLimit';
import { isOnboardingComplete } from '../services/onboarding';
import { recomputeDay } from '../services/scoring';
import { computeHumanTargets } from '../services/targets/human';
import { buildToday } from '../services/today';

export const meRoutes = new Hono<AppEnv>();
meRoutes.use('*', authMiddleware);
meRoutes.use('*', rateLimit);

const BootstrapSchema = z.object({
  timezone: z.string().min(1),
  name: z.string().min(1).optional(),
});

meRoutes.post('/bootstrap', async (c) => {
  const body = BootstrapSchema.parse(await c.req.json());
  const user = c.get('user');
  user.timezone = body.timezone;
  if (body.name) user.name = body.name;
  await user.save();
  return c.json({ user: user.toApi() });
});

meRoutes.put('/profile', async (c) => {
  const profile = HumanProfileSchema.parse(await c.req.json());
  const user = c.get('user');
  const offset = user.targets?.adaptiveOffsetKcal ?? 0;
  const targets = computeHumanTargets(profile, offset);
  const stored: StoredHumanTargets = {
    ...targets,
    computedAt: new Date(targets.computedAt),
    lastAdjustedAt: targets.lastAdjustedAt ? new Date(targets.lastAdjustedAt) : null,
    adjustmentLog: user.targets?.adjustmentLog ?? [],
  };
  user.profile = profile;
  user.targets = stored;
  // Only ever flips to true: this is the half that lands first on a fresh run, so
  // the pet step is what completes it (see services/onboarding.ts).
  if (isOnboardingComplete(user)) user.onboardingComplete = true;
  await user.save();
  await WeighInModel.create({
    subjectType: 'user',
    subjectId: user._id,
    userId: user._id,
    weighedAt: new Date(),
    weightKg: profile.weightKg,
    note: null,
  });
  await recomputeDay(user._id.toString(), dayKey(new Date(), user.timezone));
  return c.json({ user: user.toApi() });
});

meRoutes.get('/today', async (c) => {
  const today = await buildToday(c.get('userId'));
  return c.json(today);
});
