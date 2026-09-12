/**
 * Defensive, lazy access to `expo-notifications`.
 *
 * `expo-notifications` is a **native** module. The Android dev build that is already
 * on the demo phone was compiled before it was added, so `require()`-ing it there
 * throws. Every entry point in this feature goes through `notifications()`, which
 * resolves to `null` in that case and makes the whole reminder feature a silent
 * no-op — the app still boots and the rest of the demo is unaffected.
 *
 * The import below is type-only (`typeof import`), so it is erased at compile time
 * and never becomes a top-level require in the bundle.
 *
 * To actually get reminders, rebuild the dev client:
 *   pnpm --filter mobile exec expo run:android
 */
export type NotificationsModule = typeof import('expo-notifications');

/** `undefined` = not tried yet, `null` = tried and unavailable. */
let cached: NotificationsModule | null | undefined;

/**
 * Returns the native module, or `null` when this build does not contain it.
 * Never throws.
 */
export function notifications(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  try {
    // why: `require` is the only way to defer loading a native module past module
    // evaluation; a static `import` would run at bundle start and crash old builds.
    const mod = require('expo-notifications') as NotificationsModule;
    // Touch one export: some Expo modules only throw on first property access.
    cached = typeof mod.scheduleNotificationAsync === 'function' ? mod : null;
  } catch {
    cached = null;
  }
  return cached;
}

/** True when this build can schedule anything at all. */
export function notificationsAvailable(): boolean {
  return notifications() !== null;
}

/**
 * Runs `fn` with the module if it exists, swallowing anything it throws.
 * Returns `fallback` when the module is missing or the call failed.
 */
export async function withNotifications<T>(
  fn: (mod: NotificationsModule) => Promise<T>,
  fallback: T,
): Promise<T> {
  const mod = notifications();
  if (!mod) return fallback;
  try {
    return await fn(mod);
  } catch {
    return fallback;
  }
}
