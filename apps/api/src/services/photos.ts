import sharp from 'sharp';
import { store as db } from '../db/connect';
import { PhotoModel, type PhotoDoc } from '../db/models';
import type { PhotoKind, PhotoRecord } from '../db/types';
import { AppError } from '../lib/errors';
import { log } from '../lib/log';

export const MAX_PHOTO_BYTES = 300 * 1024;

export interface StoredPhoto {
  id: string;
  url: string;
  contentType: string;
  bytes: number;
  width: number;
  height: number;
}

export const urlFor = (photoId: string): string => `/api/photos/${photoId}`;

export async function compressMealJpeg(input: Buffer): Promise<Buffer> {
  let quality = 80;
  let buf = await sharp(input)
    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality })
    .toBuffer();
  while (buf.length > MAX_PHOTO_BYTES && quality > 30) {
    quality -= 10;
    buf = await sharp(input)
      .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();
  }
  return buf;
}

export async function store(
  userId: string,
  kind: PhotoKind,
  data: Buffer,
  contentType = 'image/jpeg',
): Promise<StoredPhoto> {
  let width = 0;
  let height = 0;
  // Video bytes are stored under the same collection, and sharp cannot read them.
  if (contentType.startsWith('image/')) {
    try {
      const meta = await sharp(data).metadata();
      width = meta.width ?? 0;
      height = meta.height ?? 0;
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'photo metadata read failed');
    }
  }
  const record = await db.storePhoto(userId, kind, data, contentType, width, height);
  log.info({ photoId: record.id, kind, bytes: data.byteLength, contentType }, 'photo stored');
  return { id: record.id, url: urlFor(record.id), contentType, bytes: data.byteLength, width, height };
}

export async function get(photoId: string): Promise<{ meta: PhotoRecord; data: Buffer } | null> {
  return db.getPhoto(photoId);
}

export async function fetchOwned(id: string, userId: string): Promise<PhotoDoc> {
  const photo = await PhotoModel.findById(id);
  if (!photo || photo.userId.toString() !== userId) {
    throw new AppError('NOT_FOUND', 404, 'Photo not found');
  }
  return photo as PhotoDoc;
}

/**
 * Normalize an arbitrary upload to JPEG within `maxSide`, used for both the
 * owner's source photo (1024) and Imagine outputs (768, ≤ 300 KB).
 */
export async function normalizeJpeg(input: Buffer, maxSide: number, quality = 85): Promise<Buffer> {
  let out = await sharp(input)
    .rotate()
    .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();

  // Step the quality down rather than returning something the DB will reject.
  for (let q = quality - 15; out.byteLength > MAX_PHOTO_BYTES && q >= 40; q -= 15) {
    out = await sharp(input)
      .rotate()
      .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: q, mozjpeg: true })
      .toBuffer();
  }
  return out;
}
