/**
 * Stub routes owned by P2/P3, mounted so P4's flows are exercisable end to end.
 * `GET /photos/:id` and `GET /me/today` are real contracts (API_CONTRACTS §7, §1);
 * the `/dev/*` helpers exist only to seed a user + pet without the onboarding UI.
 */
import { Hono } from 'hono';
import { PetInputSchema, MealCreateSchema } from '@petplate/shared';
import type { AuthVars } from '../lib/auth.js';
import { requireAuth } from '../lib/auth.js';
import { AppError } from '../lib/errors.js';
import { store as db } from '../db/connect.js';
import { emptyPetAvatar } from '../db/types.js';
import { config } from '../config.js';
import { dayKey } from '../lib/day.js';
import { buildToday } from '../services/today.js';
import * as photos from '../services/photos.js';
import { computePetTargets, goalFor } from './petTargets.js';
import { logFeeding } from './feedings.js';
import { getGaps } from './gaps.js';

export const devRoutes = new Hono<AuthVars>();

// ---- real contracts, stubbed implementations (P2) ----

devRoutes.get('/photos/:id', requireAuth, async (c) => {
  const found = await photos.get(c.req.param('id'));
  if (!found) throw new AppError('NOT_FOUND', 'Photo not found');
  if (found.meta.userId !== c.var.userId) throw new AppError('FORBIDDEN', 'Not your photo');
  return c.body(new Uint8Array(found.data), 200, {
    'Content-Type': found.meta.contentType,
    'Cache-Control': 'private, max-age=86400',
  });
});

devRoutes.get('/me/today', requireAuth, async (c) => c.json(await buildToday(c.var.userId)));

devRoutes.get('/nutrition/gaps', requireAuth, async (c) => {
  const days = Number(c.req.query('days') ?? 7);
  return c.json(await getGaps(c.var.userId, Number.isFinite(days) ? days : 7));
});

devRoutes.post('/pets', requireAuth, async (c) => {
  const input = PetInputSchema.parse(await c.req.json());
  const existing = await db.findPetByUserId(c.var.userId);
  if (existing) return c.json({ pet: existing }, 200);
  const pet = await db.createPet({
    ...input,
    userId: c.var.userId,
    goal: goalFor(input),
    targets: computePetTargets(input),
    avatar: emptyPetAvatar(config.GROK_DEFAULT_VOICE),
  });
  await db.updateUser(c.var.userId, { petId: pet.id, onboardingComplete: true });
  return c.json({ pet }, 201);
});

devRoutes.post('/pets/:id/feedings', requireAuth, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { grams?: number };
  const result = await logFeeding(c.var.userId, body.grams, 'tap');
  return c.json({ feeding: { grams: result.grams, kcal: result.kcal }, today: result.today }, 201);
});

/**
 * Minimal meal write so the avatar mood can be moved during testing.
 * TODO(P2): the real POST /meals enriches via USDA and returns a full Meal.
 */
devRoutes.post('/meals', requireAuth, async (c) => {
  const input = MealCreateSchema.parse(await c.req.json());
  const user = await db.findUserById(c.var.userId);
  const loggedAt = input.loggedAt ? new Date(input.loggedAt) : new Date();
  // why: no USDA lookup in the stub — a flat 1.8 kcal/g keeps totals plausible.
  const grams = input.items.reduce((sum, item) => sum + item.grams, 0);
  const meal = await db.createMeal({
    userId: c.var.userId,
    loggedAt: loggedAt.toISOString(),
    dayKey: dayKey(loggedAt, user?.timezone),
    kcal: Math.round(grams * 1.8),
    proteinG: Math.round(grams * 0.11),
  });
  return c.json({ meal, today: await buildToday(c.var.userId) }, 201);
});

// ---- dev-only seeding ----

devRoutes.post('/dev/setup', requireAuth, async (c) => {
  if (!config.DEV_BYPASS_AUTH) throw new AppError('FORBIDDEN', 'Dev routes are disabled');
  const existing = await db.findPetByUserId(c.var.userId);
  if (existing) return c.json({ pet: existing, created: false });
  const input = PetInputSchema.parse({
    name: 'Biscuit',
    species: 'dog',
    breed: 'Beagle mix',
    sex: 'male',
    neutered: true,
    ageYears: 4,
    weightKg: 14,
    idealWeightKg: 12,
    activity: 'normal',
    food: { name: 'Blue Buffalo Adult', kcalPerCup: 377, gramsPerCup: 110 },
    mealsPerDay: 2,
  });
  const pet = await db.createPet({
    ...input,
    userId: c.var.userId,
    goal: goalFor(input),
    targets: computePetTargets(input),
    avatar: emptyPetAvatar(config.GROK_DEFAULT_VOICE),
  });
  await db.updateUser(c.var.userId, { petId: pet.id, onboardingComplete: true });
  return c.json({ pet, created: true }, 201);
});
