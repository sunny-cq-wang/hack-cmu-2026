/**
 * When onboarding counts as finished.
 *
 * Two halves have to exist — the human profile (`PUT /me/profile`) and the pet
 * (`POST /pets`) — and the steps write them in that order, which is exactly what
 * made the flag unreachable: `PUT /me/profile` set `onboardingComplete` only
 * `if (user.petId)`, and on a first run no pet exists yet, while `POST /pets` never
 * touched the flag at all. A user could therefore walk the whole flow, land on Home
 * via `router.replace`, and be sent back to `/onboarding/profile` by
 * `app/index.tsx` on the next launch, with no way out but to re-save the profile a
 * second time.
 *
 * So the rule lives here and both writers ask it, which makes the order they land
 * in irrelevant.
 */
export function isOnboardingComplete(user: {
  profile: unknown;
  petId: unknown;
}): boolean {
  return Boolean(user.profile) && Boolean(user.petId);
}
