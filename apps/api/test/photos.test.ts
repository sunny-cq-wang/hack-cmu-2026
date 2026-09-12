import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { MAX_PHOTO_BYTES, normalizeJpeg } from '../src/services/photos.js';

const solid = (width: number, height: number): Promise<Buffer> =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 60 } } })
    .png()
    .toBuffer();

/** Noise does not compress, so it exercises the quality step-down path. */
const noise = (size: number): Promise<Buffer> => {
  const pixels = Buffer.alloc(size * size * 3);
  for (let i = 0; i < pixels.length; i += 1) pixels[i] = Math.floor(Math.random() * 256);
  return sharp(pixels, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer();
};

describe('normalizeJpeg', () => {
  it('downscales the long side to the requested max', async () => {
    const out = await normalizeJpeg(await solid(2000, 1000), 768);
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(768);
    expect(meta.height).toBe(384);
  });

  it('converts to JPEG', async () => {
    const meta = await sharp(await normalizeJpeg(await solid(400, 400), 768)).metadata();
    expect(meta.format).toBe('jpeg');
  });

  it('does not enlarge an image smaller than the max', async () => {
    const meta = await sharp(await normalizeJpeg(await solid(200, 200), 768)).metadata();
    expect(meta.width).toBe(200);
  });

  it('steps quality down until the result fits the photo size cap', async () => {
    const out = await normalizeJpeg(await noise(1400), 768);
    expect(out.byteLength).toBeLessThanOrEqual(MAX_PHOTO_BYTES);
  });
});
