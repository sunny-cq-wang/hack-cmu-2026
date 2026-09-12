/**
 * Wires the local reminder schedule to the app's existing state.
 *
 * Deliberately *not* a cold-open permission prompt: the OS dialog only appears once
 * onboarding is complete, `/me/today` has actually rendered, and a short settle delay
 * has passed — i.e. the user has already seen their pet and has some idea what they
 * would be saying yes to.
 *
 * Reads the pet's name and today's mood from the react-query cache that Home is
 * already using, so this adds **zero** API calls and no server endpoints.
 */
import { useEffect, useRef } from 'react';

import { useAuth } from '../../lib/auth';
import { useMe, useToday } from '../../lib/queries';
import { cancelReminders, initReminders, scheduleReminders } from './reminders';

/** Breathing room after Home first paints, so the prompt is not part of launch. */
const SETTLE_MS = 4_000;
/** Re-wordings after the first run are instant; only the prompt needs the delay. */
const RESCHEDULE_MS = 400;

export function useGoalReminders(): void {
  const { isAuthenticated } = useAuth();
  const me = useMe();
  const today = useToday();

  const onboarded = me.data?.onboardingComplete === true;
  const petName = today.data?.pet?.name ?? null;
  const mood = today.data?.mood ?? 'okay';
  const hasToday = today.data !== undefined;

  // Re-run only when the wording would actually change.
  const signature = `${petName ?? ''}|${mood}`;
  const lastSignature = useRef<string | null>(null);
  const hasRunOnce = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !onboarded || !hasToday) return;
    if (lastSignature.current === signature) return;

    let cancelled = false;
    const delay = hasRunOnce.current ? RESCHEDULE_MS : SETTLE_MS;

    const timer = setTimeout(() => {
      void (async () => {
        // Every call below is a no-op on a build without the native module.
        const ready = await initReminders();
        if (!ready || cancelled) return;
        await scheduleReminders({ petName, mood });
        if (cancelled) return;
        lastSignature.current = signature;
        hasRunOnce.current = true;
      })();
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isAuthenticated, onboarded, hasToday, signature, petName, mood]);

  // Signing out should not leave the pet nagging a phone nobody is signed in on.
  useEffect(() => {
    if (isAuthenticated) return;
    lastSignature.current = null;
    hasRunOnce.current = false;
    void cancelReminders();
  }, [isAuthenticated]);
}

/**
 * Mount once, inside the QueryClientProvider. Renders nothing — it exists so the hook
 * has somewhere to live without every screen having to remember to call it.
 */
export function GoalReminders(): null {
  useGoalReminders();
  return null;
}
