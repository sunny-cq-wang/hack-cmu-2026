/**
 * Avatar generation pipeline (INTEGRATIONS §1.3 steps 1–6).
 *
 * Contract, in order of importance:
 *  - Fire and forget: `POST /avatar/generate` returns 202 immediately.
 *  - Resumable: every step checks its `*PhotoId` first and persists right after
 *    success, so an API restart mid-run does not redo finished states.
 *  - Never throws out of the detached promise.
 *  - One image is enough for `ready`; the UI falls back to neutral for the rest.
 */
import { AvatarStatusSchema, type AvatarStatus } from '@petplate/shared';
import { store as db } from '../../db/connect';
import type { PetRecord } from '../../db/types';
import { log } from '../../lib/log';
import * as photos from '../photos';
import { petAvatarToInfo } from '../today';
import { cutoutBackground, flattenForUpstream } from './cutout';
import { editImage, generateImage } from './images';
import { pollVideo, startImageToVideo } from './video';
import {
  CELEBRATION_VIDEO_PROMPT,
  CELEBRATION_VIDEO_SECONDS,
  statePrompt,
  stylePrompt,
  virtualDescription,
  type AvatarStateKind,
  type StylePreset,
} from './prompts';

const VIDEO_POLL_INTERVAL_MS = 5_000;
const VIDEO_POLL_BUDGET_MS = 3 * 60_000;
const MAX_REHOST_BYTES = 5 * 1024 * 1024;

/** In-process guard so a double-tap on "Generate" cannot run two pipelines. */
const running = new Set<string>();

const PHOTO_ID_FIELD: Record<AvatarStateKind, 'neutralPhotoId' | 'thrivingPhotoId' | 'droopingPhotoId'> = {
  neutral: 'neutralPhotoId',
  thriving: 'thrivingPhotoId',
  drooping: 'droopingPhotoId',
};

export const isPipelineRunning = (petId: string): boolean => running.has(petId);

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Stored avatars are transparent PNGs. Both consumers of this — Imagine reference
 * images and the video seed — want an opaque frame, so flatten on the way out.
 */
async function loadBuffer(photoId: string | null): Promise<Buffer | null> {
  if (!photoId) return null;
  const found = await photos.get(photoId);
  return found ? await flattenForUpstream(found.data) : null;
}

/**
 * Produces one state image. Returns the stored photo id, or null on failure —
 * failures are logged and swallowed so the remaining states still get a chance.
 */
async function renderState(
  pet: PetRecord,
  preset: StylePreset,
  state: AvatarStateKind,
  source: Buffer | null,
  neutral: Buffer | null,
): Promise<string | null> {
  const description = source ? null : virtualDescription(pet.breed, pet.species);

  // Anchor last: `editImage` sends the final reference when the multi-image shape
  // is unavailable, so the generated neutral — the established character — is what
  // thriving and drooping are edited from, not the raw photo.
  const refs = [source, state === 'neutral' ? null : neutral].filter((b): b is Buffer => b !== null);
  const prompt = statePrompt(preset, description, state, refs.length > 1);

  try {
    const image = refs.length > 0 ? await editImage(prompt, refs) : await generateImage(prompt);
    // The avatar animates over the dark dashboard, so the card behind the mascot
    // has to go. Falls back to the untouched JPEG if the key is not safe.
    const display = await cutoutBackground(image);
    const stored = await photos.store(pet.userId, 'avatar', display.buffer, display.contentType);
    await db.patchPetAvatar(pet.id, { [PHOTO_ID_FIELD[state]]: stored.id });
    log.info({ petId: pet.id, state, photoId: stored.id }, 'avatar state stored');
    return stored.id;
  } catch (err) {
    log.warn({ petId: pet.id, state, err: (err as Error).message }, 'avatar state failed');
    return null;
  }
}

/**
 * Celebration video. Detached from the image steps: it may finish long after the
 * avatar is marked ready, and `celebrationVideoUrl` staying null is acceptable.
 */
async function runVideoStep(petId: string, thriving: Buffer): Promise<void> {
  const pet = await db.findPetById(petId);
  if (!pet || pet.avatar.celebrationVideoUrl) return;

  try {
    const { requestId } = await startImageToVideo(CELEBRATION_VIDEO_PROMPT, thriving, CELEBRATION_VIDEO_SECONDS);
    const jobs = [
      ...pet.avatar.imagineJobs.filter((j) => j.kind !== 'video'),
      { kind: 'video' as const, requestId, status: 'pending' as const },
    ];
    await db.patchPetAvatar(petId, { imagineJobs: jobs });

    const deadline = Date.now() + VIDEO_POLL_BUDGET_MS;
    while (Date.now() < deadline) {
      await sleep(VIDEO_POLL_INTERVAL_MS);
      const result = await pollVideo(requestId);
      if (result.status === 'pending') continue;

      if (result.status === 'failed' || !result.url) {
        await db.patchPetAvatar(petId, {
          imagineJobs: jobs.map((j) => (j.kind === 'video' ? { ...j, status: 'failed' as const } : j)),
        });
        log.warn({ petId, requestId }, 'celebration video failed — confetti-only celebration');
        return;
      }

      const url = await rehostVideo(pet.userId, result.url);
      await db.patchPetAvatar(petId, {
        celebrationVideoUrl: url,
        imagineJobs: jobs.map((j) => (j.kind === 'video' ? { ...j, status: 'done' as const } : j)),
      });
      log.info({ petId, url }, 'celebration video ready');
      return;
    }
    log.warn({ petId, requestId }, 'celebration video poll budget exhausted');
  } catch (err) {
    log.warn({ petId, err: (err as Error).message }, 'celebration video step failed');
  }
}

/**
 * Imagine URLs expire, so re-host small videos in `photos`. Falls back to the
 * upstream URL if it is too big or the download fails.
 */
async function rehostVideo(userId: string, url: string): Promise<string> {
  try {
    const res = await fetch(url);
    if (!res.ok) return url;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.byteLength > MAX_REHOST_BYTES) return url;
    const stored = await photos.store(userId, 'avatar', bytes, 'video/mp4');
    return stored.url;
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'video re-host failed — keeping upstream url');
    return url;
  }
}

export async function startAvatarPipeline(
  petId: string,
  source: Buffer | null,
  preset: StylePreset,
): Promise<void> {
  if (running.has(petId)) {
    log.info({ petId }, 'avatar pipeline already running — ignoring duplicate start');
    return;
  }
  running.add(petId);

  try {
    const pet = await db.findPetById(petId);
    if (!pet) {
      log.warn({ petId }, 'avatar pipeline: pet not found');
      return;
    }

    const description = source ? null : virtualDescription(pet.breed, pet.species);
    await db.patchPetAvatar(petId, {
      status: 'generating',
      stylePrompt: stylePrompt(preset, description),
    });

    // Resume: reuse whatever a previous run already finished.
    let neutralBuf = await loadBuffer(pet.avatar.neutralPhotoId);
    let produced = [pet.avatar.neutralPhotoId, pet.avatar.thrivingPhotoId, pet.avatar.droopingPhotoId].filter(
      Boolean,
    ).length;

    if (!pet.avatar.neutralPhotoId) {
      const id = await renderState(pet, preset, 'neutral', source, null);
      if (id) {
        produced += 1;
        neutralBuf = await loadBuffer(id);
      }
    }

    for (const state of ['thriving', 'drooping'] as const) {
      if (pet.avatar[PHOTO_ID_FIELD[state]]) continue;
      const id = await renderState(pet, preset, state, source, neutralBuf);
      if (id) produced += 1;
    }

    await db.patchPetAvatar(petId, { status: produced > 0 ? 'ready' : 'failed' });
    log.info({ petId, produced }, 'avatar images finished');

    if (produced === 0) return;

    const refreshed = await db.findPetById(petId);
    const thrivingBuf =
      (await loadBuffer(refreshed?.avatar.thrivingPhotoId ?? null)) ?? neutralBuf;
    if (thrivingBuf && !refreshed?.avatar.celebrationVideoUrl) {
      // Detached on purpose: the avatar is already usable.
      void runVideoStep(petId, thrivingBuf);
    }
  } catch (err) {
    // The promise is fire-and-forget; nothing can catch a throw from here.
    log.error({ petId, err: (err as Error).message }, 'avatar pipeline crashed');
    const pet = await db.findPetById(petId).catch(() => null);
    const any = pet
      ? Boolean(pet.avatar.neutralPhotoId ?? pet.avatar.thrivingPhotoId ?? pet.avatar.droopingPhotoId)
      : false;
    await db.patchPetAvatar(petId, { status: any ? 'ready' : 'failed' }).catch(() => null);
  } finally {
    running.delete(petId);
  }
}

/** Only the video step, for `POST /avatar/celebrate`. */
export async function startCelebrationVideo(petId: string): Promise<boolean> {
  const pet = await db.findPetById(petId);
  if (!pet || pet.avatar.celebrationVideoUrl) return false;
  if (pet.avatar.imagineJobs.some((j) => j.kind === 'video' && j.status === 'pending')) return false;

  const thriving = (await loadBuffer(pet.avatar.thrivingPhotoId)) ?? (await loadBuffer(pet.avatar.neutralPhotoId));
  if (!thriving) return false;

  void runVideoStep(petId, thriving);
  return true;
}

export async function getAvatarStatus(petId: string): Promise<AvatarStatus> {
  const pet = await db.findPetById(petId);
  if (!pet) return AvatarStatusSchema.parse({ status: 'none', progress: { neutral: false, thriving: false, drooping: false, video: false }, avatar: null });

  return AvatarStatusSchema.parse({
    status: pet.avatar.status,
    progress: {
      neutral: Boolean(pet.avatar.neutralPhotoId),
      thriving: Boolean(pet.avatar.thrivingPhotoId),
      drooping: Boolean(pet.avatar.droopingPhotoId),
      video: Boolean(pet.avatar.celebrationVideoUrl),
    },
    avatar: petAvatarToInfo(pet),
  });
}
