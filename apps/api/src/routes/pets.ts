import { Hono } from 'hono';
import {
  DayKey,
  FeedingCreateSchema,
  FeedingSchema,
  PetInputSchema,
  PetSchema,
  VIRTUAL_PET_KG,
} from '@petplate/shared';
import { requireAuth, type AuthVars } from '../lib/auth.js';
import { AppError } from '../lib/errors.js';
import { config } from '../config.js';
import { dayKey } from '../lib/day.js';
import { Pet } from '../db/models/pet.js';
import { User } from '../db/models/user.js';
import { Feeding } from '../db/models/feeding.js';
import { WeighIn } from '../db/models/weighIn.js';
import { computePetTargets } from '../services/targets/pet.js';
import { recomputeDay } from '../services/scoring/recomputeDay.js';
import { logFeeding } from '../services/feedings.js';
import type { PetInput } from '@petplate/shared';
import { callToApi } from '../db/models/serialize.js';

export const petsRoutes = new Hono<AuthVars>();
petsRoutes.use('*', requireAuth);

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

function applyVirtual(input: PetInput): PetInput {
  if (input.species !== 'virtual') return input;
  return { ...input, weightKg: VIRTUAL_PET_KG, idealWeightKg: VIRTUAL_PET_KG, neutered: true };
}

async function requireOwnedPet(id: string, userId: string) {
  const pet = await Pet.findById(id);
  if (!pet || String(pet.userId) !== userId) throw new AppError('NOT_FOUND', 'Pet not found');
  return pet;
}

petsRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const user = await User.findById(userId);
  if (!user) throw new AppError('NOT_FOUND', 'User not found');
  const input = applyVirtual(PetInputSchema.parse(await c.req.json()));
  const computed = computePetTargets({ ...input, adaptivePct: 0 });
  const { goal, ...targetFields } = computed;
  const pet = await Pet.create({
    userId: user._id,
    name: input.name,
    species: input.species,
    breed: input.breed,
    sex: input.sex,
    neutered: input.neutered,
    ageYears: input.ageYears,
    weightKg: input.weightKg,
    idealWeightKg: input.idealWeightKg,
    activity: input.activity,
    goal,
    food: input.food,
    mealsPerDay: input.mealsPerDay,
    targets: { ...targetFields, lastAdjustedAt: null, adjustmentLog: [] },
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
  });
  user.petId = pet._id;
  await user.save();
  await WeighIn.create({
    subjectType: 'pet',
    subjectId: pet._id,
    userId: user._id,
    weighedAt: new Date(),
    weightKg: input.weightKg,
    note: null,
  });
  const tz = user.timezone || 'America/New_York';
  await recomputeDay(userId, dayKey(new Date(), tz));
  return c.json({ pet: PetSchema.parse(callToApi(pet)) }, 201);
});

petsRoutes.get('/:id', async (c) => {
  const pet = await requireOwnedPet(c.req.param('id'), c.get('userId'));
  return c.json({ pet: PetSchema.parse(callToApi(pet)) });
});

petsRoutes.put('/:id', async (c) => {
  const userId = c.get('userId');
  const pet = await requireOwnedPet(c.req.param('id'), userId);
  const patch = PetInputSchema.partial().parse(await c.req.json());
  const weightChanged = patch.weightKg !== undefined && patch.weightKg !== pet.weightKg;
  const recomputeTargets =
    patch.weightKg !== undefined ||
    patch.idealWeightKg !== undefined ||
    patch.neutered !== undefined ||
    patch.activity !== undefined ||
    patch.food !== undefined ||
    patch.mealsPerDay !== undefined;

  Object.assign(pet, patch);
  if (pet.species === 'virtual') {
    pet.weightKg = VIRTUAL_PET_KG;
    pet.idealWeightKg = VIRTUAL_PET_KG;
    pet.neutered = true;
  }
  if (recomputeTargets) {
    const input = toPetInput(pet);
    const adaptivePct = pet.targets?.adaptivePct ?? 0;
    const computed = computePetTargets({ ...input, adaptivePct });
    const { goal, ...targetFields } = computed;
    pet.goal = goal;
    pet.mealsPerDay = computed.mealsPerDay;
    pet.targets = {
      ...pet.targets,
      ...targetFields,
      adaptivePct,
      lastAdjustedAt: pet.targets?.lastAdjustedAt ?? null,
      adjustmentLog: pet.targets?.adjustmentLog ?? [],
    };
  }
  await pet.save();
  if (weightChanged) {
    await WeighIn.create({
      subjectType: 'pet',
      subjectId: pet._id,
      userId: pet.userId,
      weighedAt: new Date(),
      weightKg: pet.weightKg,
      note: null,
    });
  }
  const user = await User.findById(userId);
  const tz = user?.timezone || 'America/New_York';
  await recomputeDay(userId, dayKey(new Date(), tz));
  return c.json({ pet: PetSchema.parse(callToApi(pet)) });
});

petsRoutes.post('/:id/feedings', async (c) => {
  const userId = c.get('userId');
  await requireOwnedPet(c.req.param('id'), userId);
  const body = FeedingCreateSchema.parse(await c.req.json().catch(() => ({})));
  const result = await logFeeding(
    userId,
    body.grams,
    body.source ?? 'tap',
    c.req.param('id'),
    body.fedAt ? new Date(body.fedAt) : undefined,
  );
  return c.json({ feeding: FeedingSchema.parse(callToApi(result.feeding)), today: result.today }, 201);
});

petsRoutes.get('/:id/feedings', async (c) => {
  const pet = await requireOwnedPet(c.req.param('id'), c.get('userId'));
  const user = await User.findById(c.get('userId'));
  const tz = user?.timezone || 'America/New_York';
  const date = c.req.query('date');
  const key = date ? DayKey.parse(date) : dayKey(new Date(), tz);
  const rows = await Feeding.find({ petId: pet._id, dayKey: key }).sort({ fedAt: 1 });
  return c.json({ feedings: rows.map((r) => FeedingSchema.parse(callToApi(r))) });
});
