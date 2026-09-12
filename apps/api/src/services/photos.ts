import sharp from 'sharp';
import { PhotoModel, type PhotoDoc, type PhotoKind } from '../db/models';
import { AppError } from '../lib/errors';

const MAX_BYTES = 300 * 1024;

export async function compressMealJpeg(input: Buffer): Promise<Buffer> {
  let quality = 80;
  let buf = await sharp(input)
    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality })
    .toBuffer();
  while (buf.length > MAX_BYTES && quality > 30) {
    quality -= 10;
    buf = await sharp(input)
      .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();
  }
  return buf;
}

export async function store(userId: string, kind: PhotoKind, buf: Buffer): Promise<{ id: string; width: number; height: number }> {
  if (buf.length > MAX_BYTES) {
    throw new AppError('VALIDATION_ERROR', 400, 'Photo exceeds 300 KB after compression');
  }
  const meta = await sharp(buf).metadata();
  const doc = await PhotoModel.create({
    userId,
    kind,
    contentType: 'image/jpeg',
    data: buf,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
  });
  return { id: doc._id.toString(), width: doc.width, height: doc.height };
}

export async function fetchOwned(id: string, userId: string): Promise<PhotoDoc> {
  const photo = await PhotoModel.findById(id);
  if (!photo || photo.userId.toString() !== userId) {
    throw new AppError('NOT_FOUND', 404, 'Photo not found');
  }
  return photo as PhotoDoc;
}
