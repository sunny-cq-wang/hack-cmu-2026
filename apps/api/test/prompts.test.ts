import { describe, expect, it } from 'vitest';
import {
  CONSISTENCY_PREFIX,
  statePrompt,
  stylePrompt,
  virtualDescription,
} from '../src/services/imagine/prompts.js';

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
});

describe('statePrompt', () => {
  it('appends the state suffix verbatim', () => {
    expect(statePrompt('sticker', null, 'neutral', false)).toContain('Neutral relaxed expression, sitting.');
    expect(statePrompt('sticker', null, 'thriving', false)).toContain('Beaming happy expression, eyes bright, tail up');
    expect(statePrompt('sticker', null, 'drooping', false)).toContain('Sad droopy expression, ears down, slumped posture');
  });

  it('adds the consistency prefix only when multiple references are sent', () => {
    expect(statePrompt('sticker', null, 'thriving', true).startsWith(CONSISTENCY_PREFIX)).toBe(true);
    expect(statePrompt('sticker', null, 'thriving', false).startsWith(CONSISTENCY_PREFIX)).toBe(false);
  });

  it('keeps "Same character, same style" on the non-neutral states', () => {
    expect(statePrompt('sticker', null, 'drooping', false)).toContain('Same character, same style.');
    expect(statePrompt('sticker', null, 'neutral', false)).not.toContain('Same character, same style.');
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
