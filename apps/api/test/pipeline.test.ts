/**
 * Covers the P4 acceptance check: restarting mid-pipeline and calling generate
 * again must not regenerate states that already finished.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PetRecord } from '../src/db/types.js';
import { emptyPetAvatar } from '../src/db/types.js';

const generateImage = vi.fn(async () => Buffer.from('generated'));
const editImage = vi.fn(async () => Buffer.from('edited'));
const startImageToVideo = vi.fn(async () => ({ requestId: 'req-1' }));
const pollVideo = vi.fn(async () => ({ status: 'pending' as const }));

let pet: PetRecord;
let photoCounter = 0;
const photoData = new Map<string, Buffer>();

vi.mock('../src/services/imagine/images.js', () => ({
  generateImage: (...args: unknown[]) => generateImage(...(args as [])),
  editImage: (...args: unknown[]) => editImage(...(args as [])),
  toDataUri: () => 'data:image/jpeg;base64,AAAA',
  MAX_REFERENCE_IMAGES: 5,
}));

vi.mock('../src/services/imagine/video.js', () => ({
  startImageToVideo: (...args: unknown[]) => startImageToVideo(...(args as [])),
  pollVideo: (...args: unknown[]) => pollVideo(...(args as [])),
}));

vi.mock('../src/services/photos.js', () => ({
  store: async (_userId: string, _kind: string, data: Buffer) => {
    photoCounter += 1;
    const id = `photo-${photoCounter}`;
    photoData.set(id, data);
    return { id, url: `/api/photos/${id}`, contentType: 'image/jpeg', bytes: data.byteLength };
  },
  get: async (id: string) => {
    const data = photoData.get(id);
    return data ? { meta: { id }, data } : null;
  },
  urlFor: (id: string) => `/api/photos/${id}`,
  normalizeJpeg: async (b: Buffer) => b,
  MAX_PHOTO_BYTES: 300 * 1024,
}));

vi.mock('../src/db/connect.js', () => ({
  store: {
    findPetById: async (id: string) => (id === pet.id ? pet : null),
    findPetByUserId: async () => pet,
    patchPetAvatar: async (id: string, patch: Partial<PetRecord['avatar']>) => {
      if (id !== pet.id) return null;
      pet.avatar = { ...pet.avatar, ...patch };
      return pet;
    },
  },
  isMongoConnected: () => false,
}));

const { startAvatarPipeline } = await import('../src/services/imagine/pipeline.js');

beforeEach(() => {
  generateImage.mockClear();
  editImage.mockClear();
  startImageToVideo.mockClear();
  photoCounter = 0;
  photoData.clear();
  pet = {
    id: 'pet-1',
    userId: 'user-1',
    name: 'Biscuit',
    species: 'dog',
    breed: 'Beagle mix',
    sex: 'male',
    neutered: true,
    ageYears: 4,
    weightKg: 14,
    idealWeightKg: 12,
    activity: 'normal',
    food: { name: 'Dry food', kcalPerCup: 377, gramsPerCup: 110 },
    mealsPerDay: 2,
    goal: 'lose',
    targets: {
      rerKcal: 451,
      merFactor: 1.6,
      baseKcal: 722,
      adaptivePct: 0,
      kcal: 722,
      portionGramsPerDay: 211,
      mealsPerDay: 2,
      computedAt: new Date().toISOString(),
      lastAdjustedAt: null,
    },
    avatar: emptyPetAvatar('eve'),
  };
});

describe('startAvatarPipeline', () => {
  it('produces all three states from a source photo and marks ready', async () => {
    await startAvatarPipeline('pet-1', Buffer.from('source'), 'sticker');

    expect(editImage).toHaveBeenCalledTimes(3);
    expect(generateImage).not.toHaveBeenCalled();
    expect(pet.avatar.status).toBe('ready');
    expect(pet.avatar.neutralPhotoId).not.toBeNull();
    expect(pet.avatar.thrivingPhotoId).not.toBeNull();
    expect(pet.avatar.droopingPhotoId).not.toBeNull();
  });

  it('passes two references for thriving and drooping so the character stays consistent', async () => {
    await startAvatarPipeline('pet-1', Buffer.from('source'), 'sticker');

    const refCounts = editImage.mock.calls.map((call) => (call as unknown as [string, Buffer[]])[1].length);
    expect(refCounts).toEqual([1, 2, 2]);
  });

  it('skips states that already have a photo id (resumable after a restart)', async () => {
    pet.avatar.neutralPhotoId = 'photo-existing';
    pet.avatar.thrivingPhotoId = 'photo-existing-2';
    photoData.set('photo-existing', Buffer.from('neutral'));
    photoData.set('photo-existing-2', Buffer.from('thriving'));

    await startAvatarPipeline('pet-1', Buffer.from('source'), 'sticker');

    expect(editImage).toHaveBeenCalledTimes(1);
    expect(pet.avatar.neutralPhotoId).toBe('photo-existing');
    expect(pet.avatar.thrivingPhotoId).toBe('photo-existing-2');
    expect(pet.avatar.status).toBe('ready');
  });

  it('uses text-to-image for a virtual pet with no source photo', async () => {
    await startAvatarPipeline('pet-1', null, 'sticker');

    expect(generateImage).toHaveBeenCalledTimes(1);
    // Later states still edit, using the generated neutral as the reference.
    expect(editImage).toHaveBeenCalledTimes(2);
  });

  it('still reports ready when only some states succeed', async () => {
    editImage.mockRejectedValueOnce(new Error('upstream 500'));

    await startAvatarPipeline('pet-1', Buffer.from('source'), 'sticker');

    expect(pet.avatar.status).toBe('ready');
    expect(pet.avatar.neutralPhotoId).toBeNull();
  });

  it('reports failed only when every state fails', async () => {
    editImage.mockRejectedValue(new Error('upstream 500'));

    await startAvatarPipeline('pet-1', Buffer.from('source'), 'sticker');

    expect(pet.avatar.status).toBe('failed');
    expect(startImageToVideo).not.toHaveBeenCalled();
  });

  it('never throws, even when the pet does not exist', async () => {
    await expect(startAvatarPipeline('missing-pet', null, 'sticker')).resolves.toBeUndefined();
  });
});
