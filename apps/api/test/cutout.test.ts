import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { cutoutBackground, flattenForUpstream } from '../src/services/imagine/cutout';

const SIZE = 120;

/** A flat-background card with a dark blob ringed in white, like an Imagine sticker. */
async function sticker(background: { r: number; g: number; b: number }): Promise<Buffer> {
  const raw = Buffer.alloc(SIZE * SIZE * 3);
  const centre = SIZE / 2;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 3;
      const d = Math.hypot(x - centre, y - centre);
      if (d < 24) {
        raw[i] = 20;
        raw[i + 1] = 20;
        raw[i + 2] = 20;
      } else if (d < 32) {
        // The white outline. It must survive: it is paler than the background but
        // unreachable from the border without crossing the dark body.
        raw[i] = 255;
        raw[i + 1] = 255;
        raw[i + 2] = 255;
      } else {
        raw[i] = background.r;
        raw[i + 1] = background.g;
        raw[i + 2] = background.b;
      }
    }
  }
  return sharp(raw, { raw: { width: SIZE, height: SIZE, channels: 3 } }).jpeg({ quality: 100 }).toBuffer();
}

async function alphaAt(png: Buffer, x: number, y: number): Promise<number> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return data[(y * info.width + x) * 4 + 3]!;
}

describe('cutoutBackground', () => {
  it('keys out a flat background and returns a PNG', async () => {
    const out = await cutoutBackground(await sticker({ r: 214, g: 236, b: 226 }));
    expect(out.contentType).toBe('image/png');

    // Corner is background → gone. Centre is the character → kept.
    expect(await alphaAt(out.buffer, 2, 2)).toBe(0);
    expect(await alphaAt(out.buffer, SIZE / 2, SIZE / 2)).toBe(255);
  });

  it("keeps the character's white outline, which is paler than the background", async () => {
    const out = await cutoutBackground(await sticker({ r: 214, g: 236, b: 226 }));
    // A point inside the white ring: only reachable from the border by crossing the
    // body, so a border-seeded fill leaves it alone where a colour threshold would not.
    expect(await alphaAt(out.buffer, SIZE / 2, SIZE / 2 - 28)).toBe(255);
  });

  it('leaves a busy background alone rather than cutting into the art', async () => {
    // Corners disagree → not a flat background → refuse the key.
    const raw = Buffer.alloc(SIZE * SIZE * 3);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const i = (y * SIZE + x) * 3;
        raw[i] = (x * 255) / SIZE;
        raw[i + 1] = (y * 255) / SIZE;
        raw[i + 2] = 128;
      }
    }
    const busy = await sharp(raw, { raw: { width: SIZE, height: SIZE, channels: 3 } })
      .jpeg({ quality: 100 })
      .toBuffer();

    const out = await cutoutBackground(busy);
    expect(out.contentType).toBe('image/jpeg');
    expect(out.buffer).toBe(busy);
  });

  it('survives bytes that are not an image', async () => {
    const junk = Buffer.from('not an image');
    const out = await cutoutBackground(junk);
    expect(out.contentType).toBe('image/jpeg');
    expect(out.buffer).toBe(junk);
  });
});

describe('flattenForUpstream', () => {
  it('flattens a cutout back to opaque so Imagine never sees alpha', async () => {
    const out = await cutoutBackground(await sticker({ r: 214, g: 236, b: 226 }));
    const flat = await flattenForUpstream(out.buffer);
    expect((await sharp(flat).metadata()).hasAlpha).toBe(false);
  });

  it('passes an existing JPEG straight through', async () => {
    const jpeg = await sticker({ r: 214, g: 236, b: 226 });
    expect(await flattenForUpstream(jpeg)).toBe(jpeg);
  });

  it('re-encodes a palette PNG, whose alpha sharp does not report', async () => {
    // The cutout emits a palette PNG with a tRNS chunk; sharp says hasAlpha=false
    // for it, so anything keying on that flag would hand xAI a PNG labelled JPEG.
    const out = await cutoutBackground(await sticker({ r: 214, g: 236, b: 226 }));
    const meta = await sharp(out.buffer).metadata();
    expect(meta.format).toBe('png');
    expect(await sharp(await flattenForUpstream(out.buffer)).metadata()).toMatchObject({
      format: 'jpeg',
    });
  });
});
