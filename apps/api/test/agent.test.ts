import { describe, expect, it } from 'vitest';
import { cannedReply, MAX_REPLY_CHARS, personaPrompt, postProcess } from '../src/services/voice/agent.js';
import type { CompactToday } from '../src/services/today.js';

const compact = (overrides: Partial<CompactToday> = {}): CompactToday => ({
  kcalRemaining: 680,
  proteinRemaining: 42,
  petFedGrams: 0,
  petTargetGrams: 211,
  topGaps: [{ label: 'Fiber', pct: 37 }],
  ...overrides,
});

describe('postProcess', () => {
  it('strips emojis, which the TTS endpoint would read aloud', () => {
    expect(postProcess('Woof! 🐶 You have 680 left 🎉')).toBe('Woof! You have 680 left');
  });

  it('collapses the whitespace left behind by removed emojis', () => {
    expect(postProcess('Hi 🐶 🎉 there')).toBe('Hi there');
  });

  it('leaves a short reply untouched', () => {
    const reply = 'You have 680 calories left and you are low on fiber.';
    expect(postProcess(reply)).toBe(reply);
  });

  it('caps long replies at the limit', () => {
    expect(postProcess('a'.repeat(400)).length).toBeLessThanOrEqual(MAX_REPLY_CHARS + 1);
  });

  it('prefers cutting at a sentence boundary rather than mid-word', () => {
    const long = `${'First sentence padding to get past the minimum length threshold here. '.repeat(3)}Trailing clause that runs well past the character cap and should be dropped entirely by the truncation logic.`;
    const out = postProcess(long);
    expect(out.endsWith('.')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(MAX_REPLY_CHARS);
  });
});

describe('cannedReply', () => {
  it('cites calories remaining and the top gap', () => {
    expect(cannedReply(compact())).toBe("You have 680 calories left and you're low on fiber. Want a suggestion?");
  });

  it('omits the gap clause when there are none', () => {
    expect(cannedReply(compact({ topGaps: [] }))).toBe('You have 680 calories left. Want a suggestion?');
  });
});

describe('personaPrompt', () => {
  it('fills in the pet name and species', () => {
    const prompt = personaPrompt('Biscuit', 'dog');
    expect(prompt).toContain('You are Biscuit, a dog');
    expect(prompt).toContain('no emojis');
    expect(prompt).toContain('Never give medical advice');
  });
});
