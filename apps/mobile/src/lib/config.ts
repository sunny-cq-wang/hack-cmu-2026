/**
 * The ONLY module in the mobile app allowed to read `process.env` (AGENTS.md §4.5).
 *
 * Expo inlines `process.env.EXPO_PUBLIC_*` at bundle time, which only works for
 * literal member access — never index into `process.env` with a variable here.
 */

const missing: string[] = [];

function required(name: string, value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    missing.push(name);
    return '';
  }
  return trimmed;
}

function optional(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function flag(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

export const config = {
  apiBase: required('EXPO_PUBLIC_API_BASE', process.env.EXPO_PUBLIC_API_BASE),
  auth0Domain: required('EXPO_PUBLIC_AUTH0_DOMAIN', process.env.EXPO_PUBLIC_AUTH0_DOMAIN),
  auth0ClientId: required('EXPO_PUBLIC_AUTH0_CLIENT_ID', process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID),
  auth0Audience: required('EXPO_PUBLIC_AUTH0_AUDIENCE', process.env.EXPO_PUBLIC_AUTH0_AUDIENCE),

  /** Dev only: serve every route from `src/lib/mock` instead of the network. */
  mockApi: flag(process.env.EXPO_PUBLIC_MOCK_API),
  /** Dev only: skip Auth0 and send `x-dev-user: <email>` (API needs `DEV_BYPASS_AUTH=true`). */
  devUser: optional(process.env.EXPO_PUBLIC_DEV_USER),
} as const;

if (missing.length > 0) {
  throw new Error(
    `Missing required env var(s): ${missing.join(', ')}. ` +
      'Copy .env.example to .env at the repo root and fill them in, then restart Metro with --clear.',
  );
}

export type Config = typeof config;
