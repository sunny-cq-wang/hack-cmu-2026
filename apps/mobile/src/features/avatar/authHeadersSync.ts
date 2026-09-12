/**
 * React Native's `<Image source={{ uri, headers }}>` needs headers synchronously,
 * but the real auth token comes from an async Auth0 call. `lib/api` keeps a snapshot
 * of the last headers it resolved, refreshed on every request, so image loads never
 * block and never go out without a bearer token once a session exists.
 */
import { authHeadersSnapshot } from '../../lib/api';

export const authHeadersSync = (): Record<string, string> => authHeadersSnapshot();
