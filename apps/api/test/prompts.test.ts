import { describe, expect, it } from 'vitest';
import {
  CONSISTENCY_PREFIX,
  PHOTOREAL_CONSISTENCY_PREFIX,
  STYLE_PRESETS,
  consistencyPrefix,
  statePrompt,
  stylePrompt,
  virtualDescription,
} from '../src/services/imagine/prompts';

describe('STYLE_PRESETS', () => {
  it('is the list routes/avatar.ts validates the incoming preset against', () => {
    expect(STYLE_PRESETS).toEqual(['sticker', 'watercolor', 'pixel', 'photoreal']);
  });
});

describe('stylePrompt', () => {
  it('uses "this pet" when a source photo is present', () => {
    const prompt = stylePrompt('sticker', null);
    expect(prompt).toContain('Turn this pet into a friendly flat-vector sticker mascot');
    expect(prompt).toContain("Keep the pet's real coat colors and markings.");
  });

  it('substitutes a description for virtual pets, since "this pet" has no referent', () => {
    expect(stylePrompt('sticker', 'beagle mix')).toContain('Turn a beagle mix into');
  });

  it('varies the base wording per preset', () => {
    expect(stylePrompt('watercolor', null)).toContain('watercolor storybook mascot');
    expect(stylePrompt('pixel', null)).toContain('pixel-art mascot sprite');
  });

  it('falls back to the sticker base for an unknown preset', () => {
    // why: presets arrive from an HTTP field, so an unexpected value must not blank the prompt.
    const prompt = stylePrompt('nope' as 'sticker', null);
    expect(prompt).toContain('flat-vector sticker mascot');
  });

  it('asks photoreal for a real photograph of the same animal, not an illustration', () => {
    const prompt = stylePrompt('photoreal', null);
    expect(prompt).toContain('photorealistic studio portrait of the same real animal');
    expect(prompt).toContain('not an illustration');
    expect(prompt).toContain('true coat colour and markings');
    expect(prompt).toContain('accurate breed features');
    expect(prompt).toContain('natural individual fur detail');
    expect(prompt).toContain('soft diffused studio lighting');
    expect(prompt).toContain('shallow depth of field with sharp focused eyes');
  });

  it('gives every preset a background the cutout can key', () => {
    // why: services/imagine/cutout.ts keys this background out so the avatar animates
    // transparently. A gradient, a vignette, a cast shadow or a near-white card all
    // make it bail out and ship an opaque rectangle onto the dark dashboard.
    for (const preset of STYLE_PRESETS) {
      const prompt = stylePrompt(preset, null);
      expect(prompt, preset).toContain('one flat uniform solid');
      expect(prompt, preset).toContain('clearly tinted rather than white or near-white');
      expect(prompt, preset).toContain('evenly lit');
      expect(prompt, preset).toContain('no gradient');
      expect(prompt, preset).toContain('no vignette');
      expect(prompt, preset).toContain('no shadow cast on the background');
    }
  });

  it('composes every preset the same way in the avatar frame', () => {
    for (const preset of STYLE_PRESETS) {
      const prompt = stylePrompt(preset, null);
      expect(prompt, preset).toContain('front-facing, centered, full body');
      expect(prompt, preset).toContain('no text, no watermark');
    }
  });
});

describe('statePrompt', () => {
  it('appends the state suffix verbatim', () => {
    expect(statePrompt('sticker', null, 'neutral', false)).toContain('Neutral relaxed expression, sitting');
    expect(statePrompt('sticker', null, 'thriving', false)).toContain('Beaming happy expression, eyes bright, tail up');
    expect(statePrompt('sticker', null, 'drooping', false)).toContain('Sad droopy expression, ears lowered, slumped posture');
  });

  it('adds the consistency prefix only when multiple references are sent', () => {
    expect(statePrompt('sticker', null, 'thriving', true).startsWith(CONSISTENCY_PREFIX)).toBe(true);
    expect(statePrompt('sticker', null, 'thriving', false).startsWith(CONSISTENCY_PREFIX)).toBe(false);
  });

  it('keeps "Same character, same style" on the non-neutral states', () => {
    expect(statePrompt('sticker', null, 'drooping', false)).toContain('Same character, same style');
    expect(statePrompt('sticker', null, 'neutral', false)).not.toContain('Same character, same style');
  });

  it('never refers to a reference image by position', () => {
    // The multi-image request shape is rejected by the current model, so exactly one
    // reference reaches the API. Wording like "the second image" pointed at an image
    // that was never sent, and the three moods drifted into different-looking pets.
    for (const preset of STYLE_PRESETS) {
      for (const state of ['neutral', 'thriving', 'drooping'] as const) {
        for (const withPrefix of [true, false]) {
          const prompt = statePrompt(preset, null, state, withPrefix).toLowerCase();
          expect(prompt, preset).not.toContain('second image');
          expect(prompt, preset).not.toContain('first image');
        }
      }
    }
  });

  it('states photoreal moods as real animal body language, not cartoon devices', () => {
    // why: "small sweat drop" and "slight bounce pose" are drawing instructions. On a
    // photograph they come back as a wet artefact and as motion blur.
    const thriving = statePrompt('photoreal', null, 'thriving', false);
    const drooping = statePrompt('photoreal', null, 'drooping', false);
    expect(thriving).toContain('Bright alert eyes, ears up and forward');
    expect(thriving).toContain('tail raised');
    expect(drooping).toContain('Tired half-closed eyes, ears back and flattened');
    expect(drooping).toContain('head lowered');
    for (const prompt of [thriving, drooping]) {
      expect(prompt).not.toContain('sweat drop');
      expect(prompt).not.toContain('bounce pose');
    }
  });

  it('keeps the framing invariant on the photoreal derived states', () => {
    expect(statePrompt('photoreal', null, 'thriving', false)).toContain('same framing and scale');
    expect(statePrompt('photoreal', null, 'drooping', false)).toContain('same framing and scale');
    expect(statePrompt('photoreal', null, 'neutral', false)).not.toContain('same framing and scale');
  });

  it('uses the stronger identity prefix for photoreal only', () => {
    // why: two drawings of "a tan dog" read as one mascot; two photographs of two tan
    // dogs read as two different pets, which is the one thing this must not do.
    expect(consistencyPrefix('photoreal')).toBe(PHOTOREAL_CONSISTENCY_PREFIX);
    expect(consistencyPrefix('sticker')).toBe(CONSISTENCY_PREFIX);
    expect(consistencyPrefix('nope' as 'sticker')).toBe(CONSISTENCY_PREFIX);
    expect(statePrompt('photoreal', null, 'drooping', true).startsWith(PHOTOREAL_CONSISTENCY_PREFIX)).toBe(true);
  });

  it('pins the photographic traits that must not drift between photoreal states', () => {
    expect(PHOTOREAL_CONSISTENCY_PREFIX).toContain('the same individual animal');
    expect(PHOTOREAL_CONSISTENCY_PREFIX).toContain('every marking in the same place');
    expect(PHOTOREAL_CONSISTENCY_PREFIX).toContain('same lens and depth of field');
    expect(PHOTOREAL_CONSISTENCY_PREFIX).toContain('the same flat background colour');
    expect(PHOTOREAL_CONSISTENCY_PREFIX).toContain('Change only the facial expression and body pose');
  });

  it('pins the identity traits that must not drift between states', () => {
    expect(CONSISTENCY_PREFIX).toContain('ear shape');
    expect(CONSISTENCY_PREFIX).toContain('coat colour and markings');
    expect(CONSISTENCY_PREFIX).toContain('Change only the facial expression and body pose');
  });
});

describe('virtualDescription', () => {
  it('prefers the owner-entered breed', () => {
    expect(virtualDescription('Shiba Inu', 'dog')).toBe('Shiba Inu');
  });

  it('falls back per species when breed is blank', () => {
    expect(virtualDescription('   ', 'cat')).toBe('friendly tabby cat');
    expect(virtualDescription(null, 'dog')).toBe('friendly medium-sized dog');
  });
});
