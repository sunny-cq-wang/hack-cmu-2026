/**
 * Generates placeholder avatar fixtures for DEMO_MODE.
 *
 * These are synthetic vector mascots, NOT Grok Imagine output — they exist so
 * DEMO_MODE and the mobile placeholder work before any API key is available.
 * Once `pnpm --filter api scratch:imagine` has run against a real key, replace
 * fixtures/avatar/*.jpg with the generated ones for a convincing demo.
 *
 * Usage: pnpm --filter api exec tsx scripts/make-fixtures.ts
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const here = __dirname;
const OUT_DIR = path.resolve(here, '../fixtures/avatar');

interface Mood {
  name: string;
  bg: string;
  body: string;
  earRotate: number;
  mouth: string;
  eyeR: number;
  extras: string;
  label: string;
}

const MOODS: Mood[] = [
  {
    name: 'thriving',
    bg: '#FFF4D6',
    body: '#E8A65C',
    earRotate: -18,
    mouth: 'M 236 300 Q 256 322 276 300',
    eyeR: 13,
    extras:
      '<path d="M 330 250 Q 372 214 366 176" stroke="#C9813C" stroke-width="16" fill="none" stroke-linecap="round"/>' +
      '<circle cx="150" cy="120" r="7" fill="#F7C948"/><circle cx="370" cy="130" r="6" fill="#F7C948"/>',
    label: 'thriving',
  },
  {
    name: 'neutral',
    bg: '#F1F3F7',
    body: '#E8A65C',
    earRotate: 0,
    mouth: 'M 236 302 Q 256 310 276 302',
    eyeR: 11,
    extras: '<path d="M 330 262 Q 360 250 364 222" stroke="#C9813C" stroke-width="16" fill="none" stroke-linecap="round"/>',
    label: 'okay',
  },
  {
    name: 'drooping',
    bg: '#E9ECF2',
    body: '#D2955A',
    earRotate: 22,
    mouth: 'M 236 312 Q 256 296 276 312',
    eyeR: 9,
    extras:
      '<path d="M 330 276 Q 352 292 344 316" stroke="#B4783A" stroke-width="16" fill="none" stroke-linecap="round"/>' +
      '<path d="M 352 158 q 12 22 0 30 q -12 -8 0 -30" fill="#7FB3E8"/>',
    label: 'drooping',
  },
];

function svgFor(mood: Mood): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${mood.bg}"/>
  <ellipse cx="256" cy="452" rx="120" ry="20" fill="rgba(0,0,0,0.10)"/>
  <ellipse cx="256" cy="360" rx="104" ry="86" fill="${mood.body}" stroke="#8A5A2B" stroke-width="7"/>
  <g transform="rotate(${mood.earRotate} 176 214)">
    <ellipse cx="176" cy="222" rx="30" ry="62" fill="#C9813C" stroke="#8A5A2B" stroke-width="7"/>
  </g>
  <g transform="rotate(${-mood.earRotate} 336 214)">
    <ellipse cx="336" cy="222" rx="30" ry="62" fill="#C9813C" stroke="#8A5A2B" stroke-width="7"/>
  </g>
  <circle cx="256" cy="240" r="98" fill="${mood.body}" stroke="#8A5A2B" stroke-width="7"/>
  <circle cx="222" cy="224" r="${mood.eyeR}" fill="#3A2A16"/>
  <circle cx="290" cy="224" r="${mood.eyeR}" fill="#3A2A16"/>
  <ellipse cx="256" cy="272" rx="20" ry="15" fill="#3A2A16"/>
  <path d="${mood.mouth}" stroke="#3A2A16" stroke-width="7" fill="none" stroke-linecap="round"/>
  ${mood.extras}
  <text x="256" y="498" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="26" fill="#8A5A2B">${mood.label}</text>
</svg>`;
}

async function main(): Promise<void> {
  await fs.mkdir(OUT_DIR, { recursive: true });
  for (const mood of MOODS) {
    const out = path.join(OUT_DIR, `${mood.name}.jpg`);
    const buf = await sharp(Buffer.from(svgFor(mood))).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
    await fs.writeFile(out, buf);
    process.stdout.write(`wrote ${path.relative(process.cwd(), out)} (${Math.round(buf.byteLength / 1024)} KB)\n`);
  }
  process.stdout.write(
    '\nNo celebration.mp4 was generated — image-to-video output must come from the real Imagine API.\n' +
      'Until it exists, DEMO_MODE celebrates with Rive/overlay confetti only.\n',
  );
}

void main();
