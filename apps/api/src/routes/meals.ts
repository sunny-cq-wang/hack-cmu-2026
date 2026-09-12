import {
  DayKey,
  MealCreateSchema,
  MealDraftSchema,
  MealSlotSchema,
} from '@petplate/shared';
import { Hono } from 'hono';
import { Types } from 'mongoose';
import { z } from 'zod';
import { MealModel, type MealDoc } from '../db/models';
import { authMiddleware, type AppEnv } from '../lib/auth';
import { dayKey, localHour } from '../lib/day';
import { AppError } from '../lib/errors';
import { analyzeMealPhoto } from '../services/grok/vision';
import { enrichItems, sumNutrients } from '../services/nutrition/enrich';
import { compressMealJpeg, store } from '../services/photos';
import { recomputeDay } from '../services/scoring';
import { buildToday } from '../services/today';

export const mealRoutes = new Hono<AppEnv>();
mealRoutes.use('*', authMiddleware);

function slotFromHour(hour: number): z.infer<typeof MealSlotSchema> {
  if (hour < 10) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snack';
}

async function fileToBuffer(file: File): Promise<Buffer> {
  return Buffer.from(await file.arrayBuffer());
}

mealRoutes.post('/analyze', async (c) => {
  const body = await c.req.parseBody();
  const photo = body.photo;
  if (!(photo instanceof File)) {
    throw new AppError('VALIDATION_ERROR', 400, 'photo file is required');
  }
  const hint = typeof body.hint === 'string' ? body.hint : undefined;
  const compressed = await compressMealJpeg(await fileToBuffer(photo));
  const stored = await store(c.get('userId'), 'meal', compressed);
  const analysis = await analyzeMealPhoto(compressed, hint);
  const items = await enrichItems(
    analysis.result.items.map((item) => ({
      name: item.name,
      grams: item.grams,
      usdaQuery: item.usdaQuery,
      estimatedKcal: item.estimatedKcal,
      confidence: item.confidence,
    })),
  );
  const draft = MealDraftSchema.parse({
    photoId: stored.id,
    items,
    totals: sumNutrients(items.map((item) => item.nutrients)),
    analysis: { model: analysis.model, latencyMs: analysis.latencyMs, fallback: analysis.fallback },
  });
  return c.json(draft);
});

mealRoutes.post('/', async (c) => {
  const body = MealCreateSchema.parse(await c.req.json());
  const user = c.get('user');
  const loggedAt = body.loggedAt ? new Date(body.loggedAt) : new Date();
  const slot = body.slot ?? slotFromHour(localHour(loggedAt, user.timezone));
  const key = dayKey(loggedAt, user.timezone);
  const items = await enrichItems(
    body.items.map((item) => ({
      name: item.name,
      grams: item.grams,
      fdcId: item.fdcId,
    })),
  );
  const totals = sumNutrients(items.map((item) => item.nutrients));
  const meal = await MealModel.create({
    userId: user._id,
    loggedAt,
    dayKey: key,
    slot,
    photoId: body.photoId ? new Types.ObjectId(body.photoId) : null,
    source: body.source,
    items,
    totals,
    analysis: null,
  });
  await recomputeDay(user._id.toString(), key);
  return c.json({ meal: (meal as MealDoc).toApi(), today: await buildToday(user._id.toString()) }, 201);
});

mealRoutes.get('/', async (c) => {
  const user = c.get('user');
  const dateParam = c.req.query('date');
  const key = dateParam ? DayKey.parse(dateParam) : dayKey(new Date(), user.timezone);
  const meals = (await MealModel.find({ userId: user._id, dayKey: key }).sort({ loggedAt: 1 })) as MealDoc[];
  return c.json({ meals: meals.map((m) => m.toApi()) });
});

mealRoutes.delete('/:id', async (c) => {
  const id = z.string().min(1).parse(c.req.param('id'));
  const user = c.get('user');
  const meal = await MealModel.findById(id);
  if (!meal || meal.userId.toString() !== user._id.toString()) {
    throw new AppError('NOT_FOUND', 404, 'Meal not found');
  }
  const key = meal.dayKey;
  await meal.deleteOne();
  await recomputeDay(user._id.toString(), key);
  return c.body(null, 204);
});
