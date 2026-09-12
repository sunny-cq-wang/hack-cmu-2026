/**
 * DEMO_MODE avatar path: copy pre-generated fixtures into `photos` and mark the
 * pet ready synchronously, so a demo never waits on Imagine (AGENTS.md §4.10).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { store as db } from '../../db/connect';
import { log } from '../../lib/log';
import * as photos from '../photos';

export const FIXTURE_DIR = path.resolve(__dirname, '../../../fixtures/avatar');

const STATES = [
  { file: 'neutral.jpg', field: 'neutralPhotoId' },
  { file: 'thriving.jpg', field: 'thrivingPhotoId' },
  { file: 'drooping.jpg', field: 'droopingPhotoId' },
] as const;

async function readFixture(file: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(path.join(FIXTURE_DIR, file));
  } catch {
    return null;
  }
}

export async function applyDemoAvatar(petId: string): Promise<boolean> {
  const pet = await db.findPetById(petId);
  if (!pet) return false;

  const patch: Record<string, string> = {};
  for (const { file, field } of STATES) {
    if (pet.avatar[field]) continue;
    const bytes = await readFixture(file);
    if (!bytes) continue;
    const stored = await photos.store(pet.userId, 'avatar', bytes, 'image/jpeg');
    patch[field] = stored.id;
  }

  const video = pet.avatar.celebrationVideoUrl ? null : await readFixture('celebration.mp4');
  if (video) {
    const stored = await photos.store(pet.userId, 'avatar', video, 'video/mp4');
    patch['celebrationVideoUrl'] = stored.url;
  }

  const hasAny =
    Object.keys(patch).length > 0 ||
    Boolean(pet.avatar.neutralPhotoId ?? pet.avatar.thrivingPhotoId ?? pet.avatar.droopingPhotoId);
  if (!hasAny) {
    log.warn({ petId, FIXTURE_DIR }, 'DEMO_MODE avatar requested but no fixtures found');
    return false;
  }

  await db.patchPetAvatar(petId, { ...patch, status: 'ready' });
  log.info({ petId, applied: Object.keys(patch) }, 'DEMO_MODE avatar applied');
  return true;
}
