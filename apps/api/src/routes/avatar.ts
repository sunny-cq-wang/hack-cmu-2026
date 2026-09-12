/**
 * Avatar endpoints — API_CONTRACTS.md §5. Owner: P4.
 */
import { Hono } from 'hono';
import { config } from '../config.js';
import { store as db } from '../db/connect.js';
import type { AuthVars } from '../lib/auth.js';
import { requireAuth } from '../lib/auth.js';
import { AppError } from '../lib/errors.js';
import { log } from '../lib/log.js';
import * as photos from '../services/photos.js';
import { applyDemoAvatar } from '../services/imagine/demo.js';
import { getAvatarStatus, isPipelineRunning, startAvatarPipeline, startCelebrationVideo } from '../services/imagine/pipeline.js';
import { STYLE_PRESETS, type StylePreset } from '../services/imagine/prompts.js';

export const avatarRoutes = new Hono<AuthVars>();

const SOURCE_MAX_SIDE = 1024;

async function requirePetId(userId: string): Promise<string> {
  const user = await db.findUserById(userId);
  if (user?.petId) return user.petId;
  // petId can lag behind if onboarding was interrupted; fall back to the lookup.
  const pet = await db.findPetByUserId(userId);
  if (!pet) throw new AppError('ONBOARDING_REQUIRED', 'Add your pet before generating an avatar');
  return pet.id;
}

const parsePreset = (raw: unknown): StylePreset =>
  typeof raw === 'string' && (STYLE_PRESETS as string[]).includes(raw) ? (raw as StylePreset) : 'sticker';

avatarRoutes.post('/generate', requireAuth, async (c) => {
  const petId = await requirePetId(c.var.userId);
  const body = await c.req.parseBody();
  const preset = parsePreset(body['stylePreset']);

  const pet = await db.findPetById(petId);
  if (!pet) throw new AppError('NOT_FOUND', 'Pet not found');

  // DEMO_MODE never touches Imagine: canned assets, marked ready synchronously.
  if (config.DEMO_MODE) {
    const applied = await applyDemoAvatar(petId);
    if (applied) return c.json({ status: 'ready', jobId: petId }, 202);
    log.warn({ petId }, 'DEMO_MODE fixtures unavailable — running the real pipeline');
  }

  let source: Buffer | null = null;
  const uploaded = body['photo'];
  if (uploaded instanceof File) {
    const raw = Buffer.from(await uploaded.arrayBuffer());
    if (raw.byteLength === 0) throw new AppError('VALIDATION_ERROR', 'Uploaded photo is empty');
    try {
      source = await photos.normalizeJpeg(raw, SOURCE_MAX_SIDE);
    } catch {
      throw new AppError('VALIDATION_ERROR', 'Could not read that image');
    }
    const stored = await photos.store(c.var.userId, 'pet_source', source, 'image/jpeg');
    await db.patchPetAvatar(petId, { sourcePhotoId: stored.id });
  } else if (pet.avatar.sourcePhotoId) {
    // Retry after a failure: reuse the photo already on file.
    const existing = await photos.get(pet.avatar.sourcePhotoId);
    source = existing?.data ?? null;
  }

  if (!source && pet.species !== 'virtual') {
    throw new AppError('VALIDATION_ERROR', 'A photo is required for a real pet');
  }
  if (isPipelineRunning(petId)) return c.json({ status: 'generating', jobId: petId }, 202);

  void startAvatarPipeline(petId, source, preset);
  return c.json({ status: 'generating', jobId: petId }, 202);
});

avatarRoutes.get('/status', requireAuth, async (c) => {
  const petId = await requirePetId(c.var.userId);
  return c.json(await getAvatarStatus(petId));
});

avatarRoutes.post('/celebrate', requireAuth, async (c) => {
  const petId = await requirePetId(c.var.userId);
  const started = await startCelebrationVideo(petId);
  return c.json({ status: started ? 'generating' : 'skipped', jobId: petId }, 202);
});
