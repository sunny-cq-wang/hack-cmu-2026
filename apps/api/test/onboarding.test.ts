import { describe, expect, it } from 'vitest';
import { isOnboardingComplete } from '../src/services/onboarding';

describe('isOnboardingComplete', () => {
  it('needs both halves', () => {
    expect(isOnboardingComplete({ profile: { sex: 'male' }, petId: 'pet-1' })).toBe(true);
  });

  it('is false with only one half, whichever it is', () => {
    // The regression: a first run saves the profile before any pet exists, so this
    // is the state `PUT /me/profile` sees — and `POST /pets` has to be the writer
    // that completes onboarding, or the app loops back to /onboarding/profile.
    expect(isOnboardingComplete({ profile: { sex: 'male' }, petId: null })).toBe(false);
    expect(isOnboardingComplete({ profile: null, petId: 'pet-1' })).toBe(false);
    expect(isOnboardingComplete({ profile: null, petId: null })).toBe(false);
  });
});
