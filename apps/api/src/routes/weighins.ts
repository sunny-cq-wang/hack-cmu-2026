import { Hono } from 'hono';
import {
  WeighInCreateSchema,
  WeighInResponseSchema,
  WeighInSchema,
  TrendSchema,
  type PetInput,
} from '@petplate/shared';
import { z } from 'zod';
import { requireAuth, type AuthVars } from '../lib/auth';
import { AppError } from '../lib/errors';
import { dayKey } from '../lib/day';
import { User } from '../db/models/user';
import { Pet } from '../db/models/pet';
import { WeighIn } from '../db/models/weighIn';
import { adjustHuman, adjustPet, trend } from '../services/targets/adaptive';
import { computeHumanTargets } from '../services/targets/human';
import { computePetTargets } from '../services/targets/pet';
import { recomputeDay } from '../services/scoring/recomputeDay';
import { PetInputSchema } from '@petplate/shared';
import { callToApi } from '../db/models/serialize';

export const weighinsRoutes = new Hono<AuthVars>();
weighinsRoutes.use('*', requireAuth);

const QuerySchema = z.object({
  subjectType: z.enum(['user', 'pet']),
  subjectId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(90).default(30),
});

function capLog<T>(log: T[], entry: T, max = 10): T[] {
  return [entry, ...log].slice(0, max);
}

function toPetInput(p: {
  name: string;
  species: PetInput['species'];
  breed?: string | null;
  sex?: 'male' | 'female' | null;
  neutered: boolean;
  ageYears?: number | null;
  weightKg: number;
  idealWeightKg: number;
  activity: PetInput['activity'];
  food?: PetInput['food'] | null;
  mealsPerDay?: number;
}): PetInput {
  return PetInputSchema.parse({
    name: p.name,
    species: p.species,
    breed: p.breed ?? null,
    sex: p.sex ?? null,
    neutered: p.neutered,
    ageYears: p.ageYears ?? null,
    weightKg: p.weightKg,
    idealWeightKg: p.idealWeightKg,
    activity: p.activity,
    food: p.food ?? undefined,
    mealsPerDay: p.mealsPerDay,
  });
}

weighinsRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const user = await User.findById(userId);
  if (!user) throw new AppError('NOT_FOUND', 'User not found');
  const body = WeighInCreateSchema.parse(await c.req.json());

  if (body.subjectType === 'user') {
    if (body.subjectId !== userId) throw new AppError('FORBIDDEN', 'Cannot log another user\'s weight');
  } else {
    const pet = await Pet.findById(body.subjectId);
    if (!pet || String(pet.userId) !== userId) throw new AppError('NOT_FOUND', 'Pet not found');
  }

  const weighedAt = body.weighedAt ? new Date(body.weighedAt) : new Date();
  const row = await WeighIn.create({
    subjectType: body.subjectType,
    subjectId: body.subjectId,
    userId: user._id,
    weighedAt,
    weightKg: body.weightKg,
    note: body.note,
  });

  const history = await WeighIn.find({
    subjectType: body.subjectType,
    subjectId: body.subjectId,
  }).sort({ weighedAt: 1 });
  const points = history.map((w) => ({ weighedAt: w.weighedAt.toISOString(), weightKg: w.weightKg }));

  let adjustment;
  let trendOut;

  if (body.subjectType === 'user') {
    if (!user.profile) throw new AppError('ONBOARDING_REQUIRED', 'Complete onboarding first');
    user.profile.weightKg = body.weightKg;
    const adj = adjustHuman({
      profile: { ...user.profile, weightKg: body.weightKg },
      adaptiveOffsetKcal: user.targets?.adaptiveOffsetKcal ?? 0,
      lastAdjustedAt: user.targets?.lastAdjustedAt ? new Date(user.targets.lastAdjustedAt).toISOString() : null,
      weighIns: points,
    });
    const offset = adj.applied ? adj.nextOffset : (user.targets?.adaptiveOffsetKcal ?? 0);
    const targets = computeHumanTargets({ ...user.profile, weightKg: body.weightKg }, offset);
    const log = capLog(user.targets?.adjustmentLog ?? [], {
      subject: 'user' as const,
      message: adj.message,
      at: new Date(),
    });
    user.targets = {
      ...targets,
      computedAt: new Date(targets.computedAt),
      adaptiveOffsetKcal: offset,
      lastAdjustedAt: adj.applied
        ? new Date()
        : targets.lastAdjustedAt
          ? new Date(targets.lastAdjustedAt)
          : (user.targets?.lastAdjustedAt ?? null),
      adjustmentLog: log,
    };
    if (adj.applied) user.markModified('targets');
    user.markModified('profile');
    user.markModified('targets');
    await user.save();
    adjustment = adj;
    trendOut = trend(points, user.profile.targetWeightKg ?? body.weightKg);
  } else {
    const pet = await Pet.findById(body.subjectId);
    if (!pet) throw new AppError('NOT_FOUND', 'Pet not found');
    pet.weightKg = body.weightKg;
    const input = toPetInput(pet);
    const adj = adjustPet({
      pet: input,
      adaptivePct: pet.targets?.adaptivePct ?? 0,
      lastAdjustedAt: pet.targets?.lastAdjustedAt ? new Date(pet.targets.lastAdjustedAt).toISOString() : null,
      weighIns: points,
    });
    const pct = adj.applied ? adj.nextAdaptivePct : (pet.targets?.adaptivePct ?? 0);
    const computed = computePetTargets({ ...input, adaptivePct: pct });
    const log = capLog(pet.targets?.adjustmentLog ?? [], {
      subject: 'pet' as const,
      message: adj.message,
      at: new Date(),
    });
    pet.goal = computed.goal;
    const { goal: _g, ...targetFields } = computed;
    void _g;
    pet.targets = {
      ...targetFields,
      computedAt: new Date(targetFields.computedAt),
      adaptivePct: pct,
      lastAdjustedAt: adj.applied ? new Date() : (pet.targets?.lastAdjustedAt ?? null),
      adjustmentLog: log,
    };
    pet.markModified('targets');
    await pet.save();
    adjustment = adj;
    trendOut = trend(points, pet.idealWeightKg);
  }

  const tz = user.timezone || 'America/New_York';
  await recomputeDay(userId, dayKey(weighedAt, tz));

  const { nextAdaptivePct: _p, nextOffset: _o, ...adjPublic } = adjustment as typeof adjustment & {
    nextAdaptivePct?: number;
    nextOffset?: number;
  };
  void _p;
  void _o;

  return c.json(
    WeighInResponseSchema.parse({
      weighIn: WeighInSchema.parse(callToApi(row)),
      adjustment: adjPublic,
      trend: TrendSchema.parse(trendOut),
    }),
    201,
  );
});

weighinsRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const q = QuerySchema.parse({
    subjectType: c.req.query('subjectType'),
    subjectId: c.req.query('subjectId'),
    limit: c.req.query('limit') ?? 30,
  });
  if (q.subjectType === 'user' && q.subjectId !== userId) {
    throw new AppError('FORBIDDEN', 'Cannot read another user\'s weigh-ins');
  }
  if (q.subjectType === 'pet') {
    const pet = await Pet.findById(q.subjectId);
    if (!pet || String(pet.userId) !== userId) throw new AppError('NOT_FOUND', 'Pet not found');
  }
  const rows = await WeighIn.find({ subjectType: q.subjectType, subjectId: q.subjectId })
    .sort({ weighedAt: -1 })
    .limit(q.limit);
  const chronological = [...rows].reverse();
  const points = chronological.map((w) => ({ weighedAt: w.weighedAt.toISOString(), weightKg: w.weightKg }));
  let targetKg = chronological[chronological.length - 1]?.weightKg ?? 0;
  if (q.subjectType === 'pet') {
    const pet = await Pet.findById(q.subjectId);
    if (pet) targetKg = pet.idealWeightKg;
  } else {
    const user = await User.findById(userId);
    targetKg = user?.profile?.targetWeightKg ?? user?.profile?.weightKg ?? targetKg;
  }
  return c.json({
    weighIns: rows.map((r) => WeighInSchema.parse(callToApi(r))),
    trend: TrendSchema.parse(trend(points, targetKg)),
  });
});
