/**
 * The ONLY place in apps/mobile that reads env vars (AGENTS.md §4.5).
 * TODO(P1): owns this file.
 */
export const config = {
  apiBase: process.env['EXPO_PUBLIC_API_BASE'] ?? 'http://localhost:3000',
  auth0Domain: process.env['EXPO_PUBLIC_AUTH0_DOMAIN'] ?? '',
  auth0ClientId: process.env['EXPO_PUBLIC_AUTH0_CLIENT_ID'] ?? '',
  auth0Audience: process.env['EXPO_PUBLIC_AUTH0_AUDIENCE'] ?? '',
  /**
   * Dev identity header used while Auth0 is not wired up; matches the API's
   * DEV_BYPASS_AUTH path. Remove once react-native-auth0 is in place.
   */
  devUser: process.env['EXPO_PUBLIC_DEV_USER'] ?? 'demo@petplate.app',
} as const;
