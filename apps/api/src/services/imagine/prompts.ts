/**
 * Avatar prompts. Kept pure and separate so they are unit-testable and so the
 * exact wording from INTEGRATIONS §1.3 is auditable in one place.
 */
export type StylePreset = 'sticker' | 'watercolor' | 'pixel' | 'photoreal';
export type AvatarStateKind = 'neutral' | 'thriving' | 'drooping';

export const STYLE_PRESETS: StylePreset[] = ['sticker', 'watercolor', 'pixel', 'photoreal'];

/**
 * The background clause every preset shares. `services/imagine/cutout.ts` keys the
 * background out so the avatar can animate transparently over the dark dashboard,
 * and a flat, evenly lit, clearly tinted background is what makes that key reliable:
 * a gradient or vignette breaks the corner-agreement check, a cast shadow leaves a
 * grey skirt behind the feet, and a white or near-white card sits close enough to a
 * white outline or a white marking that the fill walks into the character.
 */
const KEYABLE_BACKGROUND =
  'plain background in one flat uniform solid pastel color that is clearly tinted rather than ' +
  'white or near-white, evenly lit, no gradient, no vignette, no shadow cast on the background, ' +
  'no text, no watermark.';

/**
 * Base wording per preset, from INTEGRATIONS §1.3.
 *
 * `photoreal` is the odd one out: it asks for a photograph of the animal rather
 * than an illustration of it, so it has to spell out that the *subject* keeps real
 * photographic depth (fur detail, shallow depth of field) while the *background*
 * stays the same flat keyable card the illustrated presets produce. Left implicit,
 * a "studio portrait" comes back with a lit gradient backdrop the cutout refuses.
 */
const STYLE_BASE: Record<StylePreset, string> = {
  sticker:
    'Turn {subject} into a friendly flat-vector sticker mascot, front-facing, centered, full body, ' +
    `bold clean outlines, soft pastel palette, ${KEYABLE_BACKGROUND}`,
  watercolor:
    'Turn {subject} into a soft watercolor storybook mascot, front-facing, centered, full body, ' +
    `visible brush texture, gentle washes, ${KEYABLE_BACKGROUND}`,
  pixel:
    'Turn {subject} into a 32-bit pixel-art mascot sprite, front-facing, centered, full body, ' +
    `crisp pixel edges, limited retro palette, ${KEYABLE_BACKGROUND}`,
  photoreal:
    'Turn {subject} into a photorealistic studio portrait of the same real animal, not an ' +
    'illustration and not a stylised render, front-facing, centered, full body, true coat colour ' +
    'and markings, accurate breed features and body proportions, natural individual fur detail, ' +
    'soft diffused studio lighting with no harsh highlights, shallow depth of field with sharp ' +
    `focused eyes, ${KEYABLE_BACKGROUND}`,
};

const STATE_SUFFIX: Record<AvatarStateKind, string> = {
  neutral: 'Neutral relaxed expression, sitting, facing forward.',
  thriving:
    'Same character, same style, same framing and scale. Beaming happy expression, eyes bright, ' +
    'tail up, slight bounce pose.',
  drooping:
    'Same character, same style, same framing and scale. Sad droopy expression, ears lowered, ' +
    'slumped posture, small sweat drop.',
};

/**
 * Photoreal states, because the shared suffixes are cartoon stage directions. A
 * "small sweat drop" on a photograph either gets ignored or comes back as a wet
 * artefact stuck to the fur, and "slight bounce pose" invites motion blur. Real
 * animal body language carries the same three moods: ears, eyes, head and tail.
 * The "same ... same framing and scale" invariant is kept verbatim in spirit so
 * the three states still compose identically in `PetAvatar`.
 */
const PHOTOREAL_STATE_SUFFIX: Record<AvatarStateKind, string> = {
  neutral: 'Neutral relaxed expression, sitting, facing forward, ears in their natural resting position.',
  thriving:
    'Same animal, same photographic style, same framing and scale. Bright alert eyes, ears up and ' +
    'forward, relaxed open-mouth happy pant, tail raised, standing tall and energetic.',
  drooping:
    'Same animal, same photographic style, same framing and scale. Tired half-closed eyes, ears ' +
    'back and flattened, head lowered, tail down, slack low posture.',
};

/**
 * Prefix for the two derived states, per INTEGRATIONS §1.3 step 3.
 *
 * Deliberately does not refer to an image by position. The documented multi-image
 * shape is rejected by the current model, so in practice exactly one reference —
 * the anchor — reaches the API; the old "use the second image" wording pointed at
 * an image that was never sent. Naming the invariants explicitly is also what
 * keeps the three moods recognisably the same animal.
 */
export const CONSISTENCY_PREFIX =
  'Reproduce the exact character in the reference image: identical breed, head shape, ' +
  'ear shape and position, eye shape, coat colour and markings, and the same clothing ' +
  'and accessories. Keep the identical art style, line weight, outline and colour palette. ' +
  'Change only the facial expression and body pose described below. ';

/**
 * Stronger prefix for photoreal, where drift is far more visible. A sticker is
 * forgiving — two drawings of "a tan dog" still read as the same mascot — but two
 * photographs of two different tan dogs read as two different pets, which is the
 * one thing this feature must not do. So the invariants are enumerated down to the
 * camera, and "art style, line weight, outline and colour palette" is replaced by
 * the photographic properties those words do not cover.
 */
export const PHOTOREAL_CONSISTENCY_PREFIX =
  'This must be unmistakably the same individual animal as the reference photograph: identical ' +
  'breed, head shape, muzzle length, ear shape and position, eye shape and eye colour, coat ' +
  'colour, coat length and every marking in the same place, and the same collar, clothing and ' +
  'accessories. Keep the identical photographic treatment: same camera angle and distance, same ' +
  'lens and depth of field, same soft studio lighting, and the same flat background colour. Do ' +
  'not stylise, illustrate or idealise the animal, and do not substitute a different animal. ' +
  'Change only the facial expression and body pose described below. ';

export const CELEBRATION_VIDEO_PROMPT =
  'The mascot does a short joyful happy dance, confetti falls, looping-friendly, 5 seconds';

export const CELEBRATION_VIDEO_SECONDS = 5;

/** Presets arrive from an HTTP field, so an unexpected value must not blank the prompt. */
const resolve = (preset: StylePreset): StylePreset =>
  STYLE_BASE[preset] === undefined ? 'sticker' : preset;

/** The identity prefix a preset's derived states are rendered with. */
export function consistencyPrefix(preset: StylePreset): string {
  return resolve(preset) === 'photoreal' ? PHOTOREAL_CONSISTENCY_PREFIX : CONSISTENCY_PREFIX;
}

/**
 * Owner-written descriptions arrive as anything from "shiba inu" to "a round
 * moss-green dragon with tiny gold wings". Prefixing the first with an article
 * reads correctly; prefixing the second gives "Turn a a round moss-green dragon",
 * so only add the article when the text does not already open with one.
 *
 * The determiner has to be a whole word followed by a space: "two-tailed fox" and
 * "andalusian cat" open with letters a determiner also starts with, and neither is
 * one.
 */
const OPENS_WITH_DETERMINER = /^(a|an|the|some|my)\s/i;

const article = (description: string): string => (/^[aeiou]/i.test(description) ? 'an' : 'a');

const subjectFrom = (description: string): string =>
  OPENS_WITH_DETERMINER.test(description) ? description : `${article(description)} ${description}`;

/**
 * `description` is only used when there is no source photo — an invented pet —
 * where "this pet" has no referent. It becomes the owner's own description, or the
 * breed, or a per-species default (see `virtualDescription`).
 */
export function stylePrompt(preset: StylePreset, description: string | null): string {
  const subject = description ? subjectFrom(description.trim()) : 'this pet';
  const base = STYLE_BASE[resolve(preset)].replace('{subject}', subject);
  return `${base} Keep the pet's real coat colors and markings.`;
}

export function statePrompt(
  preset: StylePreset,
  description: string | null,
  state: AvatarStateKind,
  withConsistencyPrefix: boolean,
): string {
  const resolved = resolve(preset);
  const suffix = resolved === 'photoreal' ? PHOTOREAL_STATE_SUFFIX[state] : STATE_SUFFIX[state];
  const body = `${stylePrompt(resolved, description)} ${suffix}`;
  return withConsistencyPrefix ? `${consistencyPrefix(resolved)}${body}` : body;
}

/**
 * The text that stands in for a source photo when there is none.
 *
 * Precedence matters: `avatarDescription` is what the owner typed in onboarding to
 * invent this pet ("a round moss-green dragon with tiny gold wings"), so it wins
 * over `breed`, which for a virtual pet is usually blank anyway. Only when both are
 * empty does the per-species default keep the prompt from collapsing to "a ".
 *
 * Takes the pet rather than loose strings so a new precedence rule cannot be
 * applied at one of the three call sites and forgotten at the others.
 */
export interface DescribablePet {
  avatarDescription?: string | null;
  breed?: string | null;
  species: string;
}

export function virtualDescription(pet: DescribablePet): string {
  const described = pet.avatarDescription?.trim();
  if (described) return described;
  const breed = pet.breed?.trim();
  if (breed) return breed;
  return pet.species === 'cat' ? 'friendly tabby cat' : 'friendly medium-sized dog';
}
