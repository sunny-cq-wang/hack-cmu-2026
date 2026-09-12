/**
 * Hour-zero verification for Grok Imagine (P4 task file §1.2).
 *
 * Makes one real call of each kind and writes the outputs so the demo has real
 * assets. Reports each capability as OK or FAILED and exits non-zero if any
 * required capability is unavailable — that outcome changes the plan (§7).
 *
 * Usage: pnpm --filter api scratch:imagine
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, hasXaiKey } from '../../src/config.js';
import { editImage, generateImage } from '../../src/services/imagine/images.js';
import { pollVideo, startImageToVideo } from '../../src/services/imagine/video.js';
import {
  CELEBRATION_VIDEO_PROMPT,
  CELEBRATION_VIDEO_SECONDS,
  statePrompt,
  stylePrompt,
} from '../../src/services/imagine/prompts.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(here, '../../fixtures/avatar');
const OUT = path.resolve(here, 'out');

const results: { capability: string; ok: boolean; detail: string }[] = [];

function record(capability: string, ok: boolean, detail: string): void {
  results.push({ capability, ok, detail });
  process.stdout.write(`${ok ? 'OK   ' : 'FAIL '} ${capability} — ${detail}\n`);
}

async function write(dir: string, name: string, bytes: Buffer): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, name);
  await fs.writeFile(target, bytes);
  return target;
}

async function main(): Promise<void> {
  if (!hasXaiKey()) {
    process.stdout.write('XAI_API_KEY is empty — paste your key into .env and re-run.\n');
    process.exit(2);
  }
  process.stdout.write(`image model: ${config.GROK_IMAGE_MODEL}\nvideo model: ${config.GROK_VIDEO_MODEL}\n\n`);

  // 1. Text-to-image — also the virtual-pet path.
  let neutral: Buffer | null = null;
  try {
    neutral = await generateImage(statePrompt('sticker', 'friendly beagle mix dog', 'neutral', false));
    await write(FIXTURES, 'neutral.jpg', neutral);
    record('images/generations (text-to-image)', true, `${Math.round(neutral.byteLength / 1024)} KB → fixtures/avatar/neutral.jpg`);
  } catch (err) {
    record('images/generations (text-to-image)', false, (err as Error).message);
  }

  // 2. Image editing with ONE reference.
  let thriving: Buffer | null = null;
  if (neutral) {
    try {
      thriving = await editImage(statePrompt('sticker', null, 'thriving', false), [neutral]);
      await write(FIXTURES, 'thriving.jpg', thriving);
      record('images/edits (1 reference)', true, `${Math.round(thriving.byteLength / 1024)} KB → fixtures/avatar/thriving.jpg`);
    } catch (err) {
      record('images/edits (1 reference)', false, (err as Error).message);
    }
  }

  // 3. Image editing with TWO references — the consistency trick the pipeline relies on.
  if (neutral && thriving) {
    try {
      const drooping = await editImage(statePrompt('sticker', null, 'drooping', true), [thriving, neutral]);
      await write(FIXTURES, 'drooping.jpg', drooping);
      record('images/edits (2 references)', true, `${Math.round(drooping.byteLength / 1024)} KB → fixtures/avatar/drooping.jpg`);
    } catch (err) {
      record('images/edits (2 references)', false, `${(err as Error).message} — see contingency §7 (describe-then-generate)`);
    }
  }

  // 4. Image-to-video. Optional by design: failure means confetti-only celebration.
  if (thriving) {
    try {
      const { requestId } = await startImageToVideo(CELEBRATION_VIDEO_PROMPT, thriving, CELEBRATION_VIDEO_SECONDS);
      record('videos/generations (start)', true, `request_id=${requestId}`);

      const deadline = Date.now() + 3 * 60_000;
      let done = false;
      while (Date.now() < deadline && !done) {
        await new Promise((r) => setTimeout(r, 5000));
        const poll = await pollVideo(requestId);
        process.stdout.write(`     poll: ${poll.status}\n`);
        if (poll.status === 'done' && poll.url) {
          const res = await fetch(poll.url);
          const bytes = Buffer.from(await res.arrayBuffer());
          await write(FIXTURES, 'celebration.mp4', bytes);
          record('videos/{id} (poll → mp4)', true, `${Math.round(bytes.byteLength / 1024)} KB → fixtures/avatar/celebration.mp4`);
          done = true;
        } else if (poll.status === 'failed') {
          record('videos/{id} (poll → mp4)', false, 'upstream reported failed/expired');
          done = true;
        }
      }
      if (!done) record('videos/{id} (poll → mp4)', false, 'still pending after 3 min');
    } catch (err) {
      record('videos/generations (start)', false, `${(err as Error).message} — celebration falls back to confetti only`);
    }
  }

  await write(OUT, 'imagine-report.json', Buffer.from(JSON.stringify({ at: new Date().toISOString(), stylePrompt: stylePrompt('sticker', null), results }, null, 2)));

  const failed = results.filter((r) => !r.ok);
  process.stdout.write(`\n${results.length - failed.length}/${results.length} capabilities OK\n`);
  if (failed.length > 0) process.exit(1);
}

void main();
