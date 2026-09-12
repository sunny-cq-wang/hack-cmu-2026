/**
 * Local, on-device reminders from the pet. No push, no tokens, no server.
 *
 * Degrades to a silent no-op on any build that does not contain the
 * `expo-notifications` native module — see `nativeModule.ts`.
 */
export { GoalReminders, useGoalReminders } from './useGoalReminders';
export {
  cancelReminders,
  ensurePermission,
  initReminders,
  scheduleReminders,
  scheduledReminderCount,
  SCHEDULE,
  type PermissionOutcome,
  type ReminderContext,
} from './reminders';
export { notificationsAvailable } from './nativeModule';
export { reminderCopy, FALLBACK_PET_NAME, type ReminderKind } from './copy';
