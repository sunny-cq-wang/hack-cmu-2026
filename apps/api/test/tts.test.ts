import { describe, expect, it } from 'vitest';
import { config } from '../src/config';
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
    // Read the default from config: GROK_DEFAULT_VOICE is overridable via .env,
    // so a literal here would fail on any machine that sets it.
    const fallback = config.GROK_DEFAULT_VOICE.toLowerCase();
    expect(normalizeVoice('')).toBe(fallback);
    expect(normalizeVoice('   ')).toBe(fallback);
    expect(normalizeVoice(null)).toBe(fallback);
    expect(normalizeVoice(undefined)).toBe(fallback);
  });
});
