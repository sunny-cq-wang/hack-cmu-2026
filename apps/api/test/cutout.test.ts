import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { cutoutBackground, flattenForUpstream, keyThresholds } from '../src/services/imagine/cutout';

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

/**
 * A `photoreal` render: a noisy tinted studio card, a subject whose edge fades over
 * several pixels the way fur does, and a body carrying far more than 256 colours.
 * `lit` tilts the backdrop brightness across x, which is what a one-sided studio
 * light does to a backdrop — and what must be refused rather than half-keyed.
 */
async function photoreal({ lit = false }: { lit?: boolean } = {}): Promise<Buffer> {
  const bg = [120, 150, 170];
  const body = [70, 50, 40];
  const raw = Buffer.alloc(SIZE * SIZE * 3);
  const centre = SIZE / 2;
  // Deterministic "noise", so a flake cannot hide in a random seed.
  const jitter = (x: number, y: number, k: number): number => ((x * 31 + y * 17 + k * 7) % 7) - 3;

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 3;
      const d = Math.hypot(x - centre, y - centre);
      const tilt = lit ? (x / SIZE) * 100 - 50 : 0;
      for (let k = 0; k < 3; k++) {
        const back = bg[k]! + tilt + jitter(x, y, k);
        let v: number;
        if (d < 26) {
          // Fur texture: three channels out of phase, so the palette encoder cannot
          // represent this in 256 colours without visible banding.
          v = body[k]! + 55 * Math.sin((x + k * 9) / 3.1) * Math.cos((y + k * 5) / 4.3);
        } else if (d < 38) {
          const t = (d - 26) / 12;
          v = body[k]! * (1 - t) + back * t;
        } else {
          v = back;
        }
        raw[i + k] = Math.max(0, Math.min(255, Math.round(v)));
      }
    }
  }
  return sharp(raw, { raw: { width: SIZE, height: SIZE, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
}

async function distinctColours(png: Buffer): Promise<number> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const seen = new Set<number>();
  for (let p = 0; p < info.width * info.height; p++) {
    const i = p * 4;
    if (data[i + 3]! < 255) continue;
    seen.add((data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!);
  }
  return seen.size;
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

describe('keyThresholds', () => {
  const BASE = 12 * 12 * 3;
  const MAX = 26 * 26 * 3;

  it('stays at the old tight binary threshold on a near-white card', () => {
    // why: cream (254,246,233) is only 566 from pure white, so there is no room to
    // widen without the fill walking into a white outline or a white paw.
    const t = keyThresholds([254, 246, 233], 0);
    expect(t.hard).toBe(BASE);
    expect(t.soft).toBe(BASE);
  });

  it('opens a feathered band once the card is clearly tinted', () => {
    // Soft fur edges are part background; cut binary they leave a coloured halo.
    const t = keyThresholds([120, 150, 170], 0);
    expect(t.hard).toBe(BASE);
    expect(t.soft).toBeGreaterThan(BASE);
    expect(t.soft).toBeLessThanOrEqual(MAX);
  });

  it('widens the hard cut for a noisy card but never past the ceiling', () => {
    const quiet = keyThresholds([120, 150, 170], 4);
    const noisy = keyThresholds([120, 150, 170], 900);
    expect(quiet.hard).toBe(BASE);
    expect(noisy.hard).toBeGreaterThan(quiet.hard);
    expect(noisy.hard).toBeLessThanOrEqual(MAX);
    expect(keyThresholds([0, 0, 0], 1e9).soft).toBeLessThanOrEqual(MAX);
  });

  it('never opens more than a quarter of the way to white', () => {
    for (const bg of [[254, 246, 233], [230, 230, 240], [120, 150, 170], [20, 30, 40]] as const) {
      const headroom = (255 - bg[0]) ** 2 + (255 - bg[1]) ** 2 + (255 - bg[2]) ** 2;
      expect(keyThresholds([...bg], 1e9).soft).toBeLessThanOrEqual(Math.max(BASE, headroom * 0.25));
    }
  });
});

describe('cutoutBackground on a photoreal render', () => {
  it('keys a noisy studio card without eating the subject', async () => {
    const out = await cutoutBackground(await photoreal());
    expect(out.contentType).toBe('image/png');
    expect(await alphaAt(out.buffer, 2, 2)).toBe(0);
    expect(await alphaAt(out.buffer, SIZE / 2, SIZE / 2)).toBe(255);
  });

  it('feathers the soft fur edge instead of leaving a halo of background', async () => {
    const out = await cutoutBackground(await photoreal());
    // Out at the pale end of the fur ramp the pixel is mostly backdrop. A binary cut
    // keeps it fully opaque, which is the halo; it must come back partly transparent.
    const alpha = await alphaAt(out.buffer, SIZE / 2, SIZE / 2 - 36);
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThan(255);
  });

  it('does not posterise the fur into a 256-colour palette', async () => {
    const out = await cutoutBackground(await photoreal());
    expect(await distinctColours(out.buffer)).toBeGreaterThan(256);
  });

  it('refuses a one-sided lit backdrop rather than half-keying it', async () => {
    // The documented fallback: an unkeyable background returns the original bytes.
    const lit = await photoreal({ lit: true });
    const out = await cutoutBackground(lit);
    expect(out.contentType).toBe('image/jpeg');
    expect(out.buffer).toBe(lit);
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
