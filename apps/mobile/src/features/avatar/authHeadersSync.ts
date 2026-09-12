/**
 * React Native's `<Image source={{ uri, headers }}>` needs headers synchronously,
 * but the real auth token comes from an async Auth0 call. This holds the last
 * known headers so image loads never block.
 *
 * TODO(P1): call `primeAuthHeaders()` once after sign-in with the Auth0 access
 * token so photo requests carry a real bearer token.
 */
import { config } from '../../lib/config';

let cached: Record<string, string> = { 'x-dev-user': config.devUser };

export const primeAuthHeaders = (headers: Record<string, string>): void => {
  cached = headers;
};

export const authHeadersSync = (): Record<string, string> => cached;
