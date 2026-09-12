import { describe, expect, it } from 'vitest';
import { normalizeVoice } from '../src/services/voice/tts';

describe('normalizeVoice', () => {
  it('lowercases the voice id, because xAI voice ids are lowercase', () => {
    // AvatarInfoSchema in shared is frozen with default 'Ara'.
    expect(normalizeVoice('Ara')).toBe('ara');
    expect(normalizeVoice('EVE')).toBe('eve');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeVoice('  Leo  ')).toBe('leo');
  });

  it('falls back to the configured default when blank or missing', () => {
    expect(normalizeVoice('')).toBe('eve');
    expect(normalizeVoice('   ')).toBe('eve');
    expect(normalizeVoice(null)).toBe('eve');
    expect(normalizeVoice(undefined)).toBe('eve');
  });
});
