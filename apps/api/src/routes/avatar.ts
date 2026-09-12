/**
 * Avatar endpoints — API_CONTRACTS.md §5. Owner: P4.
 */
import { Hono } from 'hono';
import { config } from '../config';
import { store as db } from '../db/connect';
import type { AuthVars } from '../lib/auth';
import { requireAuth } from '../lib/auth';
import { AppError } from '../lib/errors';
import { log } from '../lib/log';
import * as photos from '../services/photos';
import { applyDemoAvatar } from '../services/imagine/demo';
import { getAvatarStatus, isPipelineRunning, startAvatarPipeline, startCelebrationVideo } from '../services/imagine/pipeline';
import { STYLE_PRESETS, stylePrompt, virtualDescription, type StylePreset } from '../services/imagine/prompts';

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

/**
 * True when the freshly normalized upload is byte-identical to the source photo
 * already on file. `normalizeJpeg` is deterministic, so re-submitting the same
 * picked file lands here and stays a resume rather than a full re-render.
 */
async function sameAsStoredSource(sourcePhotoId: string | null, next: Buffer): Promise<boolean> {
  if (!sourcePhotoId) return false;
  try {
    const existing = await photos.get(sourcePhotoId);
    return existing ? existing.data.equals(next) : false;
  } catch {
    return false;
  }
}

/** Multipart carries strings, so accept the usual spellings of "yes". */
const parseFlag = (raw: unknown): boolean =>
  typeof raw === 'string' && ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());

avatarRoutes.post('/generate', requireAuth, async (c) => {
  const petId = await requirePetId(c.var.userId);
  const body = await c.req.parseBody();
  const preset = parsePreset(body['stylePreset']);
  const askedToRegenerate = parseFlag(body['regenerate']);

  const pet = await db.findPetById(petId);
  if (!pet) throw new AppError('NOT_FOUND', 'Pet not found');

  // DEMO_MODE never touches Imagine: canned assets, marked ready synchronously.
  if (config.DEMO_MODE) {
    const applied = await applyDemoAvatar(petId, { regenerate: askedToRegenerate });
    if (applied) return c.json({ status: 'ready', jobId: petId }, 202);
    log.warn({ petId }, 'DEMO_MODE fixtures unavailable — running the real pipeline');
  }

  let source: Buffer | null = null;
  let photoChanged = false;
  const uploaded = body['photo'];
  if (uploaded instanceof File) {
    const raw = Buffer.from(await uploaded.arrayBuffer());
    if (raw.byteLength === 0) throw new AppError('VALIDATION_ERROR', 'Uploaded photo is empty');
    try {
      source = await photos.normalizeJpeg(raw, SOURCE_MAX_SIDE);
    } catch {
      throw new AppError('VALIDATION_ERROR', 'Could not read that image');
    }
    // "Try again" re-uploads the same file. Comparing the normalized bytes keeps
    // that a resume (cheap) while a genuinely new photo becomes a regeneration.
    photoChanged = !(await sameAsStoredSource(pet.avatar.sourcePhotoId, source));
    if (photoChanged) {
      const stored = await photos.store(c.var.userId, 'pet_source', source, 'image/jpeg');
      await db.patchPetAvatar(petId, { sourcePhotoId: stored.id });
    }
  } else if (pet.avatar.sourcePhotoId) {
    // Retry after a failure: reuse the photo already on file.
    const existing = await photos.get(pet.avatar.sourcePhotoId);
    source = existing?.data ?? null;
  }

  if (!source && pet.species !== 'virtual') {
    throw new AppError('VALIDATION_ERROR', 'A photo is required for a real pet');
  }
  // Running pipelines are never disturbed — the caller just keeps polling.
  if (isPipelineRunning(petId)) return c.json({ status: 'generating', jobId: petId }, 202);

  const description = source ? null : virtualDescription(pet);
  const presetChanged = pet.avatar.stylePrompt !== '' && pet.avatar.stylePrompt !== stylePrompt(preset, description);
  const regenerate = askedToRegenerate || photoChanged || presetChanged;

  if (regenerate) {
    log.info({ petId, askedToRegenerate, photoChanged, presetChanged }, 'avatar regeneration requested');
  }

  void startAvatarPipeline(petId, source, preset, { regenerate });
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
