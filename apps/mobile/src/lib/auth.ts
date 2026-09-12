/**
 * Auth0 wrapper. Everything the app knows about "who is signed in" comes from here.
 *
 * `EXPO_PUBLIC_DEV_USER` short-circuits the whole thing with a synthetic session so
 * onboarding is walkable without an Auth0 tenant; `api.ts` then sends `x-dev-user`
 * instead of a bearer token (pairs with `DEV_BYPASS_AUTH=true` on the API).
 */
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';
import { useAuth0 } from 'react-native-auth0';

import { setAccessTokenProvider } from './api';
import { config } from './config';
import { log } from './log';

export const AUTH0_SCOPE = 'openid profile email offline_access';

/** IANA zone for `POST /me/bootstrap` (AGENTS.md §4.6). */
export function deviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/**
 * `useMe()` needs the Auth0 display name for `POST /me/bootstrap`, but bootstrap is
 * a react-query call and not a hook consumer of Auth0. `useAuth()` mirrors the name
 * here whenever the session changes.
 */
let displayName: string | null = null;

export function currentDisplayName(): string | null {
  return displayName;
}

export interface AuthSession {
  isAuthenticated: boolean;
  isLoading: boolean;
  name: string | null;
  email: string | null;
  /** True when the synthetic `EXPO_PUBLIC_DEV_USER` session is in play. */
  isDevSession: boolean;
  error: Error | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

export function useAuth(): AuthSession {
  const auth0 = useAuth0();
  const queryClient = useQueryClient();
  const devUser = config.devUser;

  const { authorize, clearSession, clearCredentials, getCredentials, user, isLoading, error } = auth0;

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    if (devUser) {
      return null;
    }
    try {
      const credentials = await getCredentials(undefined, 0, {});
      return credentials?.accessToken ?? null;
    } catch (cause) {
      log.warn('auth', 'could not read stored credentials', {
        reason: cause instanceof Error ? cause.message : String(cause),
      });
      return null;
    }
  }, [devUser, getCredentials]);

  useEffect(() => {
    setAccessTokenProvider(getAccessToken);
    return () => setAccessTokenProvider(null);
  }, [getAccessToken]);

  useEffect(() => {
    displayName = devUser ? 'Dev User' : (user?.name ?? user?.email ?? null);
  }, [devUser, user]);

  const signIn = useCallback(async (): Promise<void> => {
    if (!devUser) {
      await authorize({ audience: config.auth0Audience, scope: AUTH0_SCOPE });
    }
    // `POST /me/bootstrap` itself runs in `useMe()`, which is idempotent and fires as
    // soon as this invalidation lands — by then Auth0 has populated `user.name`.
    await queryClient.invalidateQueries({ queryKey: ['me'] });
  }, [authorize, devUser, queryClient]);

  const signOut = useCallback(async (): Promise<void> => {
    if (!devUser) {
      await clearSession();
      await clearCredentials();
    }
    displayName = null;
    queryClient.clear();
  }, [clearCredentials, clearSession, devUser, queryClient]);

  return useMemo<AuthSession>(
    () => ({
      isAuthenticated: devUser ? true : user !== null,
      isLoading: devUser ? false : isLoading,
      name: devUser ? 'Dev User' : (user?.name ?? null),
      email: devUser ?? user?.email ?? null,
      isDevSession: devUser !== null,
      error: devUser ? null : (error ?? null),
      signIn,
      signOut,
    }),
    [devUser, error, isLoading, signIn, signOut, user],
  );
}
