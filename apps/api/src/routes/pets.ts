/**
 * TODO(P3): replace this file with the full pets / feedings surface.
 * Frozen for P1 onboarding after the P2 merge: `POST /pets` → `{ pet }`, links `user.petId`.
 */
import { PetInputSchema } from '@petplate/shared';
import { Hono } from 'hono';
import { config } from '../config';
import { PetModel, WeighInModel, type PetDoc, type StoredPetTargets } from '../db/models';
import { authMiddleware, type AppEnv } from '../lib/auth';
import { dayKey } from '../lib/day';
import { rateLimit } from '../lib/rateLimit';
import { recomputeDay } from '../services/scoring';
import { computePetTargets } from '../services/targets/pet';

export const petRoutes = new Hono<AppEnv>();
petRoutes.use('*', authMiddleware);
petRoutes.use('*', rateLimit);

petRoutes.post('/', async (c) => {
  const input = PetInputSchema.parse(await c.req.json());
  const user = c.get('user');
  const computed = computePetTargets(input);
  const { goal, ...targetFields } = computed;
  const stored: StoredPetTargets = {
    ...targetFields,
    computedAt: new Date(targetFields.computedAt),
    lastAdjustedAt: targetFields.lastAdjustedAt ? new Date(targetFields.lastAdjustedAt) : null,
    adjustmentLog: [],
  };
  const pet = (await PetModel.create({
    userId: user._id,
    ...input,
    goal,
    targets: stored,
    avatar: {
      status: 'none',
      sourcePhotoId: null,
      neutralPhotoId: null,
      thrivingPhotoId: null,
      droopingPhotoId: null,
      celebrationVideoUrl: null,
      stylePrompt: '',
      voice: config.GROK_DEFAULT_VOICE,
      imagineJobs: [],
    },
  })) as PetDoc;
  user.petId = pet._id;
  if (user.profile) user.onboardingComplete = true;
  await user.save();
  await WeighInModel.create({
    subjectType: 'pet',
    subjectId: pet._id,
    userId: user._id,
    weighedAt: new Date(),
    weightKg: input.weightKg,
    note: null,
  });
  await recomputeDay(user._id.toString(), dayKey(new Date(), user.timezone));
  return c.json({ pet: pet.toApi() }, 201);
});
