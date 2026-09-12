/**
 * The pet's personality: *when* it does something unprompted, *what* it does, and
 * *what it says* when you poke it.
 *
 * Deliberately free of React and Reanimated so every decision here is a pure
 * function of `happiness` / `mood` / `score` plus an injected random number —
 * `petMotion.ts` owns the animation, `PetAvatar.tsx` owns the bubble.
 *
 * Nothing here decides the mood. Mood arrives from `/me/today` and the server owns
 * all of the math behind it (AGENTS.md §4.3, §8).
 */
import type { AvatarState } from '../../lib/shared';

/** The unprompted things the pet does between hops. */
export type IdleBehaviour = 'headTilt' | 'doubleHop' | 'lookAround' | 'shiver';

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/**
 * How likely each micro-behaviour is at a given happiness (0–1).
 *
 * A thriving pet bounces and wags; a drooping one mostly shivers and glances
 * around. Head tilts happen at every mood — they are the pet's resting curiosity.
 */
export function idleWeights(happiness01: number): ReadonlyArray<readonly [IdleBehaviour, number]> {
  const h = clamp01(happiness01);
  const droop = 1 - h;
  return [
    ['headTilt', 3],
    ['doubleHop', 6 * h * h],
    ['lookAround', 1.5 + 2.5 * h],
    ['shiver', 5 * droop * droop],
  ] as const;
}

/**
 * @param random a value in [0, 1) — injected so this stays pure and testable.
 */
export function pickIdleBehaviour(happiness01: number, random: number): IdleBehaviour {
  const weights = idleWeights(happiness01);
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = clamp01(random) * total;
  for (const [behaviour, weight] of weights) {
    cursor -= weight;
    if (cursor <= 0) return behaviour;
  }
  return 'headTilt';
}

/** Fastest and slowest the idle scheduler will ever tick, before jitter. */
const IDLE_BASE_MS = 10_500;
const IDLE_HAPPY_BONUS_MS = 5_500;
const IDLE_JITTER_MIN = 0.8;
const IDLE_JITTER_RANGE = 0.55;

/**
 * Delay until the next micro-behaviour: roughly 4–7 s when thriving, 8–14 s when
 * drooping. Randomized so the pet never looks like it is on a metronome.
 */
export function nextIdleDelayMs(happiness01: number, random: number): number {
  const base = IDLE_BASE_MS - IDLE_HAPPY_BONUS_MS * clamp01(happiness01);
  return Math.round(base * (IDLE_JITTER_MIN + IDLE_JITTER_RANGE * clamp01(random)));
}

// ---------- speech ----------

/**
 * What the pet says when you tap it. Short, warm, and pointed at the next useful
 * action — never a number, because the pet is not a dashboard.
 */
const LINES_BY_MOOD: Record<AvatarState, readonly string[]> = {
  thriving: [
    "Let's go for a walk! 🐾",
    'Best day ever. Again.',
    'You fed us both right today.',
    'Treat? No? Fine. Walk?',
    "Keep this up and I'm unbearable.",
  ],
  okay: [
    "We're halfway to a good day.",
    "One decent meal and we're golden.",
    "What's for dinner, then?",
    'I believe in us. Mildly.',
    'Scratch behind the ear? For focus.',
  ],
  drooping: [
    'I could use a better dinner…',
    'Rough day. Tomorrow we reset.',
    'A short walk would fix us both.',
    'Did we forget a meal? We forgot a meal.',
    'I am not sulking. I am resting.',
  ],
};

/** Said instead of the mood line when the day is already outstanding. */
const PERFECT_LINE = "Perfect plate. Chef's kiss. 🐶";
/** Said when the day has barely started, whatever the mood reads as. */
const EMPTY_DAY_LINE = 'Nothing logged yet — start us off?';

const PERFECT_SCORE = 95;
const EMPTY_SCORE = 1;

/**
 * The rotating list for the current mood. `index` just walks forward; the caller
 * keeps it in a ref so consecutive taps never repeat a line.
 *
 * @param score today's combined score, straight from `/me/today`. Only used to pick
 *   which list to read — never recomputed here.
 */
export function petSpeech(mood: AvatarState, score: number, index: number): string {
  if (score >= PERFECT_SCORE) return PERFECT_LINE;
  if (score < EMPTY_SCORE) return EMPTY_DAY_LINE;
  const lines = LINES_BY_MOOD[mood];
  const safe = lines.length > 0 ? lines : LINES_BY_MOOD.okay;
  return safe[((index % safe.length) + safe.length) % safe.length] ?? safe[0] ?? '…';
}

/** How long a speech bubble stays up before it fades itself out. */
export const SPEECH_VISIBLE_MS = 2_400;
