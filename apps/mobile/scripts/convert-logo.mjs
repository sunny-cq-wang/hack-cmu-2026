/**
 * Punch the cream background out of the Kibble & Kale lockup and lift the
 * dark-green ink so the mark reads on the app's #0F1115 background.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import sharp from 'sharp';

const SRC = process.argv[2];
const DEST = process.argv[3];
if (!SRC || !DEST) {
  process.stderr.write('usage: node convert-logo.mjs <src.png> <dest.png>\n');
  process.exit(1);
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      h = ((b - r) / d + 2) / 6;
      break;
    default:
      h = ((r - g) / d + 4) / 6;
  }
  return { h: h * 360, s, l };
}

function hslToRgb(h, s, l) {
  h /= 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

for (let i = 0; i < data.length; i += 4) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  const { h, s, l } = rgbToHsl(r, g, b);
  // The lockup's "white" is a warm ivory (≈248,245,228). In HSL that still
  // looks saturated, so key off channel height + distance to that ivory.
  const creamDist = Math.hypot(r - 248, g - 245, b - 228);
  const ivory = Math.min(r, g, b) > 208 && creamDist < 48;
  const nearIvory = Math.min(r, g, b) > 190 && creamDist < 72;
  const greenHue = h >= 70 && h <= 175;

  if (ivory || nearIvory) {
    const t = ivory ? 0 : Math.min(1, (creamDist - 48) / 24);
    data[i + 3] = Math.round(data[i + 3] * t);
    continue;
  }

  // Dark brand ink (dog outline + wordmark) → light sage so it pops on black.
  // Leaf fill sits higher in lightness (~0.4–0.55) and must stay the original green.
  if (greenHue && l < 0.32 && s > 0.12) {
    const [nr, ng, nb] = hslToRgb(138, 0.42, 0.82);
    data[i] = nr;
    data[i + 1] = ng;
    data[i + 2] = nb;
  }
}

mkdirSync(dirname(DEST), { recursive: true });
const transparent = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
await transparent.clone().png().toFile(DEST);

const preview = DEST.replace(/\.png$/i, '-on-black.png');
await sharp({
  create: { width: info.width, height: info.height, channels: 3, background: '#0F1115' },
})
  .composite([{ input: await transparent.clone().png().toBuffer() }])
  .png()
  .toFile(preview);

process.stdout.write(`wrote ${DEST} (${info.width}x${info.height})\n`);
process.stdout.write(`wrote ${preview}\n`);
