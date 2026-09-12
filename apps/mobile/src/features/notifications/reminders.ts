/**
 * Local (on-device) reminder scheduling. **No push, no Expo push tokens, no server.**
 *
 * Three repeating local notifications, all fired by the OS from a schedule we hand it
 * once — so they keep arriving with the app closed and without a backend:
 *
 *   08:30 daily  breakfast nudge
 *   18:30 daily  "did you feed <pet>?"
 *   Sun 10:00    weekly weigh-in
 *
 * Everything here funnels through `withNotifications()`, so on a dev build that
 * predates `expo-notifications` every function below resolves to its fallback and
 * nothing throws. See `nativeModule.ts`.
 */
import type { AvatarState } from '../../lib/shared';
import { REMINDER_IDS, REMINDER_TAG, reminderCopy, type ReminderKind } from './copy';
import { notifications, withNotifications, type NotificationsModule } from './nativeModule';

/** Android needs an explicit channel or reminders land silently in the tray. */
const CHANNEL_ID = 'reminders';

export const SCHEDULE = {
  breakfast: { hour: 8, minute: 30 },
  dinner: { hour: 18, minute: 30 },
  /** Weekday 1 = Sunday in expo-notifications' weekly trigger. */
  weighIn: { weekday: 1, hour: 10, minute: 0 },
} as const;

export interface ReminderContext {
  petName: string | null;
  mood: AvatarState;
}

export type PermissionOutcome = 'granted' | 'denied' | 'unavailable';

/**
 * Installs the foreground presentation handler and the Android channel. Safe to call
 * more than once; cheap when the module is missing.
 */
export async function initReminders(): Promise<boolean> {
  const mod = notifications();
  if (!mod) return false;

  try {
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // A handler we cannot install just means no in-app banner; scheduling still works.
  }

  return withNotifications(async (n) => {
    await n.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Meal reminders',
      importance: n.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 120],
      lightColor: '#3DDC97',
    });
    return true;
  }, true);
}

/**
 * Asks for permission **only if it has never been asked**. The OS itself is the
 * "have we asked?" record, so there is no extra storage and a user who said no is
 * never nagged.
 */
export async function ensurePermission(): Promise<PermissionOutcome> {
  return withNotifications<PermissionOutcome>(async (n) => {
    const current = await n.getPermissionsAsync();
    if (current.granted) return 'granted';
    if (!current.canAskAgain) return 'denied';

    const asked = await n.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
    return asked.granted ? 'granted' : 'denied';
  }, 'unavailable');
}

/** Cancels only the notifications this module scheduled. */
export async function cancelReminders(): Promise<void> {
  await withNotifications(async (n) => {
    const scheduled = await n.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((request) => isOurs(request.content.data))
        .map((request) => n.cancelScheduledNotificationAsync(request.identifier)),
    );
  }, undefined);
}

const isOurs = (data: unknown): boolean =>
  typeof data === 'object' &&
  data !== null &&
  (data as { tag?: unknown }).tag === REMINDER_TAG;

/**
 * Replaces every PetPlate reminder with a freshly worded set. Idempotent: call it
 * whenever the pet's name or mood changes and the tray stays at exactly three.
 *
 * @returns the number of reminders actually scheduled (0 on a build without the
 *   native module, or when permission was not granted).
 */
export async function scheduleReminders(context: ReminderContext): Promise<number> {
  const permission = await ensurePermission();
  if (permission !== 'granted') return 0;

  await cancelReminders();

  return withNotifications(async (n) => {
    const kinds: readonly ReminderKind[] = ['breakfast', 'dinner', 'weighIn'];
    for (const kind of kinds) {
      await n.scheduleNotificationAsync({
        identifier: REMINDER_IDS[kind],
        content: {
          ...reminderCopy(kind, context.petName, context.mood),
          data: { tag: REMINDER_TAG, kind },
        },
        trigger: triggerFor(n, kind),
      });
    }
    return kinds.length;
  }, 0);
}

function triggerFor(
  n: NotificationsModule,
  kind: ReminderKind,
): Parameters<NotificationsModule['scheduleNotificationAsync']>[0]['trigger'] {
  if (kind === 'weighIn') {
    return {
      type: n.SchedulableTriggerInputTypes.WEEKLY,
      channelId: CHANNEL_ID,
      ...SCHEDULE.weighIn,
    };
  }
  return {
    type: n.SchedulableTriggerInputTypes.DAILY,
    channelId: CHANNEL_ID,
    ...SCHEDULE[kind],
  };
}

/** How many PetPlate reminders are currently armed. Handy for a debug screen. */
export async function scheduledReminderCount(): Promise<number> {
  return withNotifications(async (n) => {
    const scheduled = await n.getAllScheduledNotificationsAsync();
    return scheduled.filter((request) => isOurs(request.content.data)).length;
  }, 0);
}
