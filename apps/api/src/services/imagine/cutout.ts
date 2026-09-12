/**
 * Background removal for generated avatars.
 *
 * Imagine returns the mascot on a flat pastel card. That reads fine in a gallery
 * tile, but the Home avatar sits on the dark dashboard and animates — an opaque
 * rectangle hopping around is exactly what you do not want. The prompt asks for a
 * flat, uniform background precisely so it can be keyed out here.
 *
 * Prompting alone can never solve this: the Imagine responses come back as JPEG,
 * which has no alpha channel, so transparency has to be added after the fact.
 *
 * The key is a border-seeded flood fill rather than a global colour threshold, so
 * a pale background is removed while pale pixels *inside* the character — most
 * importantly the sticker's white outline — are kept. If the four corners disagree
 * the background is not flat, and the original image is returned untouched.
 *
 * The thresholds are measured from the image rather than fixed, because the four
 * presets hand over very different edges: flat vector art cuts cleanly at a tight
 * threshold, while the `photoreal` preset returns soft fur with a JPEG-noisy card
 * behind it, where the same tight threshold leaves a coloured halo. They are
 * measured rather than passed in as a preset so the caller — `pipeline.ts` — keeps
 * one code path, and so an off-style render is judged on what it actually is.
 */
import sharp from 'sharp';
import { log } from '../../lib/log';

/**
 * Squared RGB distance that always counts as "the same colour as the corner".
 *
 * Deliberately tight. Imagine hands back a near-white card — a measured one was
 * cream (254,246,233), only 566 in squared distance from pure white — so a loose
 * tolerance lets the fill walk straight out of the background and eat the sticker's
 * white outline, and with it any white marking on a pale pet. Flat JPEG areas vary
 * by a couple of levels (squared distance well under 50), so 12 per channel clears
 * the background comfortably while keeping a wide margin below that 566.
 *
 * This is the floor, not the whole story: see `keyThresholds`.
 */
const BASE_FILL_TOLERANCE = 12 * 12 * 3;
/** Hard ceiling on the widened tolerance, whatever the measurements say. */
const MAX_FILL_TOLERANCE = 26 * 26 * 3;
/**
 * The widened tolerance may never claim more than this share of the gap between
 * the background and pure white. A white outline, a white blaze or a white paw is
 * the thing a border-seeded fill is most likely to eat, so how far the tolerance
 * may open is a function of how much room the background actually left.
 */
const WHITE_SAFETY_FRACTION = 0.25;
/**
 * Border noise is measured as a mean squared distance, i.e. a variance, so
 * multiplying by 9 widens the tolerance to roughly three standard deviations.
 */
const NOISE_SIGMAS_SQUARED = 9;
/**
 * How much wider than the opaque-cut threshold the feathered band reaches. Flat
 * vector art transitions from background to ink in one pixel, but photoreal fur
 * transitions over several, and every one of those in-between pixels is part
 * background. Cutting them binary is what leaves a coloured halo around the dog
 * on the dark dashboard, so they get partial alpha instead.
 */
const SOFT_BAND_FACTOR = 4;
/** Below this alpha a pixel counts as "removed" for the sanity fractions. */
const CLEARED_ALPHA = 128;
/** Corners must agree within this to be treated as one flat background. */
const CORNER_AGREEMENT = 16 * 16 * 3;
/** Patch size sampled at each corner. */
const CORNER_PATCH = 10;
/** Half-width of the box blur that softens the alpha edge, in pixels. */
const EDGE_FEATHER_RADIUS = 1;

export interface Cutout {
  buffer: Buffer;
  contentType: string;
}

const dist2 = (
  r: number,
  g: number,
  b: number,
  or_: number,
  og: number,
  ob: number,
): number => (r - or_) ** 2 + (g - og) ** 2 + (b - ob) ** 2;

function samplePatch(
  data: Buffer,
  width: number,
  x0: number,
  y0: number,
): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = y0; y < y0 + CORNER_PATCH; y++) {
    for (let x = x0; x < x0 + CORNER_PATCH; x++) {
      const i = (y * width + x) * 4;
      r += data[i]!;
      g += data[i + 1]!;
      b += data[i + 2]!;
      n++;
    }
  }
  return [r / n, g / n, b / n];
}

/**
 * Mean squared deviation of the border ring from the background colour — how noisy
 * this particular card is. Pixels further out than `MAX_FILL_TOLERANCE` are dropped
 * rather than averaged in: they are the character touching the frame, and letting
 * them into the average would widen the tolerance on the strength of the very thing
 * the tolerance is supposed to protect.
 */
function borderNoise(
  data: Buffer,
  width: number,
  height: number,
  bg: [number, number, number],
): number {
  let total = 0;
  let n = 0;
  const add = (x: number, y: number): void => {
    const i = (y * width + x) * 4;
    const d = dist2(data[i]!, data[i + 1]!, data[i + 2]!, bg[0], bg[1], bg[2]);
    if (d > MAX_FILL_TOLERANCE) return;
    total += d;
    n++;
  };
  for (let x = 0; x < width; x++) {
    add(x, 0);
    add(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    add(0, y);
    add(width - 1, y);
  }
  return n === 0 ? 0 : total / n;
}

/** Above this many distinct colours, palette quantisation is visible. */
const PALETTE_COLOUR_LIMIT = 256;
/** Sample every Nth pixel when counting colours; the answer only needs to be a side. */
const COLOUR_SAMPLE_STRIDE = 7;

/**
 * Whether the image is flat enough to survive PNG palette quantisation.
 *
 * The three illustrated presets come back with a handful of colours, where a
 * palette PNG is both smaller and lossless. A `photoreal` render has thousands, and
 * forcing it through 256 posterises the fur into visible bands — so it is worth the
 * larger file to encode it in full colour. Counting stops as soon as the answer is
 * known, so this is cheap on exactly the images that would be expensive to count.
 */
function isLowColour(data: Buffer, pixels: number): boolean {
  const seen = new Set<number>();
  for (let p = 0; p < pixels; p += COLOUR_SAMPLE_STRIDE) {
    const i = p * 4;
    // Quantise to 5 bits per channel: JPEG noise should not read as a new colour.
    seen.add(((data[i]! >> 3) << 10) | ((data[i + 1]! >> 3) << 5) | (data[i + 2]! >> 3));
    if (seen.size > PALETTE_COLOUR_LIMIT) return false;
  }
  return true;
}

export interface KeyThresholds {
  /** At or below this distance from the background a pixel is cut fully. */
  hard: number;
  /** Above this it is left fully opaque; in between it is feathered. */
  soft: number;
}

/**
 * Picks the two flood-fill thresholds for one image.
 *
 * `hard` opens up from `BASE_FILL_TOLERANCE` in proportion to how noisy the card
 * is, and `soft` adds the feathered band that keeps soft fur edges from leaving a
 * halo. Both are capped by how far the background sits from pure white, so a card
 * that came back near-white — against the prompt's instructions — gets exactly the
 * old tight binary threshold and nothing is put at risk.
 */
export function keyThresholds(bg: [number, number, number], noise: number): KeyThresholds {
  const whiteHeadroom = dist2(bg[0], bg[1], bg[2], 255, 255, 255) * WHITE_SAFETY_FRACTION;
  const ceiling = Math.max(BASE_FILL_TOLERANCE, Math.min(MAX_FILL_TOLERANCE, whiteHeadroom));
  const hard = Math.min(ceiling, Math.max(BASE_FILL_TOLERANCE, noise * NOISE_SIGMAS_SQUARED));
  return { hard, soft: Math.min(ceiling, hard * SOFT_BAND_FACTOR) };
}

/**
 * Separable box blur over the alpha mask, so the cut edge is not aliased.
 *
 * Done by hand rather than with `sharp().blur()`: sharp widens a single-channel
 * raw buffer to three channels on the way out, which silently misaligns the mask
 * against the image it is joined to.
 */
function featherAlpha(alpha: Buffer, width: number, height: number): Buffer {
  const r = EDGE_FEATHER_RADIUS;
  const span = r * 2 + 1;
  const horizontal = Buffer.alloc(width * height);
  const out = Buffer.alloc(width * height);

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let d = -r; d <= r; d++) {
        const sx = x + d < 0 ? 0 : x + d >= width ? width - 1 : x + d;
        sum += alpha[row + sx]!;
      }
      horizontal[row + x] = Math.round(sum / span);
    }
  }

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let sum = 0;
      for (let d = -r; d <= r; d++) {
        const sy = y + d < 0 ? 0 : y + d >= height ? height - 1 : y + d;
        sum += horizontal[sy * width + x]!;
      }
      out[y * width + x] = Math.round(sum / span);
    }
  }

  return out;
}

/**
 * Replaces a flat background with transparency. Returns a PNG on success, or the
 * input unchanged (as JPEG) when the background is not flat enough to key safely.
 */
export async function cutoutBackground(input: Buffer): Promise<Cutout> {
  const fallback: Cutout = { buffer: input, contentType: 'image/jpeg' };

  try {
    const { data, info } = await sharp(input)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height } = info;
    if (width < CORNER_PATCH * 2 || height < CORNER_PATCH * 2) return fallback;

    const corners = [
      samplePatch(data, width, 0, 0),
      samplePatch(data, width, width - CORNER_PATCH, 0),
      samplePatch(data, width, 0, height - CORNER_PATCH),
      samplePatch(data, width, width - CORNER_PATCH, height - CORNER_PATCH),
    ];

    const bg: [number, number, number] = [
      corners.reduce((a, c) => a + c[0], 0) / 4,
      corners.reduce((a, c) => a + c[1], 0) / 4,
      corners.reduce((a, c) => a + c[2], 0) / 4,
    ];

    const flat = corners.every((c) => dist2(c[0], c[1], c[2], bg[0], bg[1], bg[2]) <= CORNER_AGREEMENT);
    if (!flat) {
      log.info({ ext: 'imagine.cutout' }, 'background not flat — keeping the original');
      return fallback;
    }

    const { hard, soft } = keyThresholds(bg, borderNoise(data, width, height, bg));
    const band = soft - hard;

    // Flood fill inward from every border pixel. An explicit stack keeps this
    // iterative; a recursive fill would blow the stack on a 1024² image.
    const alpha = Buffer.alloc(width * height, 255);
    const seen = new Uint8Array(width * height);
    const stack: number[] = [];

    const push = (x: number, y: number): void => {
      const p = y * width + x;
      if (seen[p]) return;
      const i = p * 4;
      const d = dist2(data[i]!, data[i + 1]!, data[i + 2]!, bg[0], bg[1], bg[2]);
      if (d > soft) return;
      seen[p] = 1;
      // Inside `hard` this is background. Between `hard` and `soft` it is a blend of
      // background and subject — a fur edge — so it keeps the share of itself that is
      // not background instead of being cut square.
      alpha[p] = d <= hard || band <= 0 ? 0 : Math.round((255 * (d - hard)) / band);
      stack.push(p);
    };

    for (let x = 0; x < width; x++) {
      push(x, 0);
      push(x, height - 1);
    }
    for (let y = 0; y < height; y++) {
      push(0, y);
      push(width - 1, y);
    }

    while (stack.length > 0) {
      const p = stack.pop()!;
      const x = p % width;
      const y = (p - x) / width;
      if (x > 0) push(x - 1, y);
      if (x < width - 1) push(x + 1, y);
      if (y > 0) push(x, y - 1);
      if (y < height - 1) push(x, y + 1);
    }

    let cleared = 0;
    let touched = 0;
    for (let p = 0; p < alpha.length; p++) {
      if (alpha[p]! < CLEARED_ALPHA) cleared++;
      if (alpha[p]! < 255) touched++;
    }
    const clearedFrac = cleared / (width * height);
    const touchedFrac = touched / (width * height);

    // Nothing removed means the key failed; almost everything removed means it ate
    // the character. Either way the original is the safer answer. `touchedFrac`
    // catches the failure mode the feathered band introduces: a fill that leaked
    // across the whole subject leaving it faint rather than gone, which the cleared
    // count alone would wave through as a good cutout.
    if (clearedFrac < 0.02 || clearedFrac > 0.95 || touchedFrac > 0.97) {
      log.info(
        {
          ext: 'imagine.cutout',
          clearedFrac: +clearedFrac.toFixed(3),
          touchedFrac: +touchedFrac.toFixed(3),
          hard: Math.round(hard),
          soft: Math.round(soft),
        },
        'cutout rejected',
      );
      return fallback;
    }

    const softAlpha = featherAlpha(alpha, width, height);

    const rgb = Buffer.alloc(width * height * 3);
    for (let p = 0; p < width * height; p++) {
      rgb[p * 3] = data[p * 4]!;
      rgb[p * 3 + 1] = data[p * 4 + 1]!;
      rgb[p * 3 + 2] = data[p * 4 + 2]!;
    }

    const palette = isLowColour(data, width * height);
    const png = await sharp(rgb, { raw: { width, height, channels: 3 } })
      .joinChannel(softAlpha, { raw: { width, height, channels: 1 } })
      .png({ compressionLevel: 9, palette })
      .toBuffer();

    log.info(
      {
        ext: 'imagine.cutout',
        ok: true,
        clearedFrac: +clearedFrac.toFixed(3),
        palette,
        hard: Math.round(hard),
        soft: Math.round(soft),
        bytes: png.byteLength,
      },
      'background removed',
    );
    return { buffer: png, contentType: 'image/png' };
  } catch (err) {
    log.warn({ ext: 'imagine.cutout', err: (err as Error).message }, 'cutout failed — keeping the original');
    return fallback;
  }
}

/**
 * Undoes the cutout for the two places that must not see transparency: Imagine
 * reference images (a transparent ref confuses the character match) and the
 * image-to-video seed.
 *
 * Keyed on format rather than `hasAlpha`, because sharp reports `hasAlpha: false`
 * for a palette PNG carrying a tRNS chunk — which is exactly what the cutout
 * produces. Trusting that flag let a PNG through under a `data:image/jpeg` URI and
 * xAI rejected the whole request as "not a valid JPG, PNG, WebP, or ICO image".
 * Anything that is not already a JPEG is re-encoded, so the bytes always match the
 * media type `toDataUri` stamps on them.
 */
export async function flattenForUpstream(input: Buffer): Promise<Buffer> {
  try {
    const meta = await sharp(input).metadata();
    if (meta.format === 'jpeg') return input;
    return await sharp(input).flatten({ background: '#ffffff' }).jpeg({ quality: 92 }).toBuffer();
  } catch {
    return input;
  }
}
