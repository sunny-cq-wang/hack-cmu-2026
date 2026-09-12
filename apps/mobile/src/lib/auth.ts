/**
 * Auth0 wrapper. Everything the app knows about "who is signed in" comes from here.
 *
 * `EXPO_PUBLIC_DEV_USER` short-circuits the whole thing with a synthetic session so
 * onboarding is walkable without an Auth0 tenant; `api.ts` then sends `x-dev-user`
 * instead of a bearer token (pairs with `DEV_BYPASS_AUTH=true` on the API).
 *
 * why the lazy require: `react-native-auth0` resolves its TurboModule with
 * `TurboModuleRegistry.getEnforcing('A0Auth0')` at *module evaluation* time, which
 * throws outright in Expo Go — it has no custom native code. A top-level import would
 * therefore crash the app before the dev session ever got a chance to opt out, so the
 * real implementation is pulled in only when there is no dev user.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';

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

type Auth0Module = typeof import('react-native-auth0');

let auth0Module: Auth0Module | null = null;

/** Evaluates `react-native-auth0` on first use. Never called in a dev session. */
export function requireAuth0(): Auth0Module {
  auth0Module ??= require('react-native-auth0') as Auth0Module;
  return auth0Module;
}

/** The real Auth0-backed session. */
function useRealAuth(): AuthSession {
  const auth0 = requireAuth0().useAuth0();
  const queryClient = useQueryClient();

  const { authorize, clearSession, clearCredentials, getCredentials, user, isLoading, error } = auth0;

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    try {
      const credentials = await getCredentials(undefined, 0, {});
      return credentials?.accessToken ?? null;
    } catch (cause) {
      log.warn('auth', 'could not read stored credentials', {
        reason: cause instanceof Error ? cause.message : String(cause),
      });
      return null;
    }
  }, [getCredentials]);

  useEffect(() => {
    setAccessTokenProvider(getAccessToken);
    return () => setAccessTokenProvider(null);
  }, [getAccessToken]);

  useEffect(() => {
    displayName = user?.name ?? user?.email ?? null;
  }, [user]);

  const signIn = useCallback(async (): Promise<void> => {
    await authorize({ audience: config.auth0Audience, scope: AUTH0_SCOPE });
    // `POST /me/bootstrap` itself runs in `useMe()`, which is idempotent and fires as
    // soon as this invalidation lands — by then Auth0 has populated `user.name`.
    await queryClient.invalidateQueries({ queryKey: ['me'] });
  }, [authorize, queryClient]);

  const signOut = useCallback(async (): Promise<void> => {
    await clearSession();
    await clearCredentials();
    displayName = null;
    queryClient.clear();
  }, [clearCredentials, clearSession, queryClient]);

  return useMemo<AuthSession>(
    () => ({
      isAuthenticated: user !== null,
      isLoading,
      name: user?.name ?? null,
      email: user?.email ?? null,
      isDevSession: false,
      error: error ?? null,
      signIn,
      signOut,
    }),
    [error, isLoading, signIn, signOut, user],
  );
}

/**
 * The synthetic `EXPO_PUBLIC_DEV_USER` session: always signed in, and it never touches
 * `react-native-auth0`, so it runs in Expo Go.
 */
function useDevAuth(): AuthSession {
  const queryClient = useQueryClient();
  const devUser = config.devUser ?? '';

  useEffect(() => {
    // No bearer token exists — `api.ts` sends the `x-dev-user` header instead.
    setAccessTokenProvider(async () => null);
    return () => setAccessTokenProvider(null);
  }, []);

  useEffect(() => {
    displayName = 'Dev User';
  }, []);

  const signIn = useCallback(async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ['me'] });
  }, [queryClient]);

  const signOut = useCallback(async (): Promise<void> => {
    displayName = null;
    queryClient.clear();
  }, [queryClient]);

  return useMemo<AuthSession>(
    () => ({
      isAuthenticated: true,
      isLoading: false,
      name: 'Dev User',
      email: devUser,
      isDevSession: true,
      error: null,
      signIn,
      signOut,
    }),
    [devUser, signIn, signOut],
  );
}

/**
 * Picked once at module scope, not per render: `config.devUser` is inlined at bundle
 * time and cannot change while the process lives, so hook order stays stable.
 */
export const useAuth: () => AuthSession = config.devUser ? useDevAuth : useRealAuth;
