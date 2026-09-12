/**
 * Avatar prompts. Kept pure and separate so they are unit-testable and so the
 * exact wording from INTEGRATIONS §1.3 is auditable in one place.
 */
export type StylePreset = 'sticker' | 'watercolor' | 'pixel';
export type AvatarStateKind = 'neutral' | 'thriving' | 'drooping';

export const STYLE_PRESETS: StylePreset[] = ['sticker', 'watercolor', 'pixel'];

/** Base wording per preset. `sticker` is verbatim from INTEGRATIONS §1.3. */
const STYLE_BASE: Record<StylePreset, string> = {
  sticker:
    'Turn {subject} into a friendly flat-vector sticker mascot, front-facing, centered, full body, bold clean outlines, soft pastel palette, plain solid light background, no text, no watermark.',
  watercolor:
    'Turn {subject} into a soft watercolor storybook mascot, front-facing, centered, full body, visible brush texture, gentle washes, plain solid light background, no text, no watermark.',
  pixel:
    'Turn {subject} into a 32-bit pixel-art mascot sprite, front-facing, centered, full body, crisp pixel edges, limited retro palette, plain solid light background, no text, no watermark.',
};

const STATE_SUFFIX: Record<AvatarStateKind, string> = {
  neutral: 'Neutral relaxed expression, sitting.',
  thriving: 'Same character, same style. Beaming happy expression, eyes bright, tail up, slight bounce pose.',
  drooping: 'Same character, same style. Sad droopy expression, ears down, slumped posture, small sweat drop.',
};

/** Prefix used when more than one reference is sent, per INTEGRATIONS §1.3 step 3. */
export const CONSISTENCY_PREFIX = 'Use the second image as the exact character to reproduce. ';

export const CELEBRATION_VIDEO_PROMPT =
  'The mascot does a short joyful happy dance, confetti falls, looping-friendly, 5 seconds';

export const CELEBRATION_VIDEO_SECONDS = 5;

/**
 * `description` is only used for virtual pets (no source photo), where "this pet"
 * has no referent — it becomes "a <breed or description>".
 */
export function stylePrompt(preset: StylePreset, description: string | null): string {
  const subject = description ? `a ${description}` : 'this pet';
  const base = (STYLE_BASE[preset] ?? STYLE_BASE.sticker).replace('{subject}', subject);
  return `${base} Keep the pet's real coat colors and markings.`;
}

export function statePrompt(
  preset: StylePreset,
  description: string | null,
  state: AvatarStateKind,
  withConsistencyPrefix: boolean,
): string {
  const body = `${stylePrompt(preset, description)} ${STATE_SUFFIX[state]}`;
  return withConsistencyPrefix ? `${CONSISTENCY_PREFIX}${body}` : body;
}

/** Free-text describing a virtual pet, used in place of a photo. */
export function virtualDescription(breed: string | null, species: string): string {
  if (breed && breed.trim()) return breed.trim();
  return species === 'cat' ? 'friendly tabby cat' : 'friendly medium-sized dog';
}
