/**
 * Reminder copy. Every line is written *from the pet* — PetPlate's whole premise is
 * that the two of you eat on the same loop, so the nudge comes from the one with the
 * most to lose.
 *
 * Pure functions only: no React, no native module, no network. The mood and score
 * passed in come straight from the cached `/me/today` payload — this file never
 * recomputes either (AGENTS.md §4.3).
 */
import type { AvatarState } from '../../lib/shared';

/** Used when the pet has not been created yet, or `/me/today` is not cached. */
export const FALLBACK_PET_NAME = 'Your pet';

export type ReminderKind = 'breakfast' | 'dinner' | 'weighIn';

export interface ReminderCopy {
  title: string;
  body: string;
}

/** Stable per-kind ids so a reschedule replaces rather than duplicates. */
export const REMINDER_IDS: Record<ReminderKind, string> = {
  breakfast: 'petplate-breakfast',
  dinner: 'petplate-dinner',
  weighIn: 'petplate-weighin',
};

/** Tag on every notification we own, so we only ever cancel our own. */
export const REMINDER_TAG = 'petplate-reminder';

const DINNER_BODY_BY_MOOD: Record<AvatarState, string> = {
  thriving: "We're having a great day. One good dinner and the streak holds.",
  okay: 'Halfway to a good day. Dinner could seal it.',
  drooping: 'Today got away from us. A proper dinner and we start again tomorrow.',
};

const BREAKFAST_BODY_BY_MOOD: Record<AvatarState, string> = {
  thriving: 'Same time as yesterday? It worked. Log it and we go again.',
  okay: 'Whatever you have, log it — I eat when you eat.',
  drooping: "Let's start today properly. Breakfast for both of us.",
};

export function reminderCopy(
  kind: ReminderKind,
  petName: string | null | undefined,
  mood: AvatarState,
): ReminderCopy {
  const name = petName?.trim() ? petName.trim() : FALLBACK_PET_NAME;

  switch (kind) {
    case 'breakfast':
      return {
        title: `${name} is up already 🥣`,
        body: BREAKFAST_BODY_BY_MOOD[mood],
      };
    case 'dinner':
      return {
        title: `${name} is waiting for dinner 🐶`,
        body: DINNER_BODY_BY_MOOD[mood],
      };
    case 'weighIn':
      return {
        title: 'Weigh-in day ⚖️',
        body: `Thirty seconds on the scale and ${name} gets a fresh target for the week.`,
      };
  }
}
