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
import { useCallback, useEffect, useMemo, useState } from 'react';

import { getActiveDevUser, registerAccessTokenProvider, setActiveDevUser } from './api';
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

/**
 * Auth0 connection names. These are the tenant's *connection* identifiers, not free
 * text — `Username-Password-Authentication` is the default database connection every
 * tenant is created with. Renaming it in the Auth0 dashboard means renaming it here.
 */
export const AUTH0_CONNECTION = {
  emailPassword: 'Username-Password-Authentication',
} as const;

export type Auth0Connection = (typeof AUTH0_CONNECTION)[keyof typeof AUTH0_CONNECTION];

/**
 * The one address the API lets in without credentials (its `DEMO_LOGIN_EMAIL`). Judges
 * tap straight into the seeded account rather than being handed a password. Changing it
 * here alone does nothing — the API compares against its own copy.
 */
export const DEMO_LOGIN_EMAIL = 'demo@petplate.app';

export interface SignInOptions {
  /**
   * Enter the shared demo account instead of authenticating. No Auth0 round trip
   * happens; `api.ts` sends `x-dev-user: <DEMO_LOGIN_EMAIL>` for the rest of the session.
   */
  demo?: boolean;
  /**
   * Dev session only: mint a brand-new synthetic user so the onboarding flow runs
   * from scratch instead of landing on the seeded demo account.
   */
  fresh?: boolean;
  /**
   * Skip Universal Login's connection picker and go straight to this provider.
   * Omit it to show Auth0's own picker with every enabled connection.
   */
  connection?: Auth0Connection;
  /** `signup` opens Universal Login on its Sign Up tab rather than Log In. */
  screenHint?: 'login' | 'signup';
}

export interface AuthSession {
  isAuthenticated: boolean;
  isLoading: boolean;
  name: string | null;
  email: string | null;
  /** True when the synthetic `EXPO_PUBLIC_DEV_USER` session is in play. */
  isDevSession: boolean;
  error: Error | null;
  signIn: (opts?: SignInOptions) => Promise<void>;
  signOut: () => Promise<void>;
}

type Auth0Module = typeof import('react-native-auth0');

let auth0Module: Auth0Module | null = null;

/** Evaluates `react-native-auth0` on first use. Never called in a dev session. */
export function requireAuth0(): Auth0Module {
  auth0Module ??= require('react-native-auth0') as Auth0Module;
  return auth0Module;
}

/**
 * Demo state lives outside React because two different screens observe it — the sign-in
 * screen that starts it and the You screen that ends it — and neither owns the other.
 */
let demoSessionActive = false;
const demoSessionListeners = new Set<() => void>();

function notifyDemoSession(): void {
  for (const listener of demoSessionListeners) listener();
}

/** The real Auth0-backed session, plus the credential-free demo door. */
function useRealAuth(): AuthSession {
  const auth0 = requireAuth0().useAuth0();
  const queryClient = useQueryClient();
  const [, rerenderDemo] = useState(0);

  const { authorize, clearSession, clearCredentials, getCredentials, user, isLoading, error } = auth0;

  useEffect(() => {
    const listener = (): void => rerenderDemo((n) => n + 1);
    demoSessionListeners.add(listener);
    return () => {
      demoSessionListeners.delete(listener);
    };
  }, []);

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

  // Returns its own remover, so unmounting this consumer cannot deregister the token
  // getter for the other `useAuth()` consumers that are still mounted.
  useEffect(() => registerAccessTokenProvider(getAccessToken), [getAccessToken]);

  useEffect(() => {
    displayName = user?.name ?? user?.email ?? null;
  }, [user]);

  const signIn = useCallback(async (opts?: SignInOptions): Promise<void> => {
    if (opts?.demo) {
      setActiveDevUser(DEMO_LOGIN_EMAIL);
      displayName = 'Demo User';
      demoSessionActive = true;
      notifyDemoSession();
      queryClient.clear();
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      return;
    }
    // `connection` pins Universal Login to the database connection's email/password
    // form instead of Auth0's picker; `screen_hint` is not a first-class field on
    // WebAuthorizeParameters, so it rides along as a raw query param.
    await authorize({
      audience: config.auth0Audience,
      scope: AUTH0_SCOPE,
      ...(opts?.connection ? { connection: opts.connection } : {}),
      ...(opts?.screenHint ? { additionalParameters: { screen_hint: opts.screenHint } } : {}),
    });
    // `POST /me/bootstrap` itself runs in `useMe()`, which is idempotent and fires as
    // soon as this invalidation lands — by then Auth0 has populated `user.name`.
    await queryClient.invalidateQueries({ queryKey: ['me'] });
  }, [authorize, queryClient]);

  const signOut = useCallback(async (): Promise<void> => {
    // A demo session has no Auth0 session behind it, and clearSession() would open a
    // browser to log out of a tenant this user never logged into.
    if (demoSessionActive) {
      setActiveDevUser(null);
      demoSessionActive = false;
      notifyDemoSession();
      displayName = null;
      queryClient.clear();
      return;
    }
    await clearSession();
    await clearCredentials();
    displayName = null;
    queryClient.clear();
  }, [clearCredentials, clearSession, queryClient]);

  const demo = demoSessionActive;
  return useMemo<AuthSession>(
    () => ({
      isAuthenticated: user !== null || demo,
      isLoading,
      name: demo ? 'Demo User' : (user?.name ?? null),
      email: demo ? DEMO_LOGIN_EMAIL : (user?.email ?? null),
      isDevSession: demo,
      error: error ?? null,
      signIn,
      signOut,
    }),
    [demo, error, isLoading, signIn, signOut, user],
  );
}

/**
 * Shared across every `useDevAuth()` caller so Sign out on You and the login
 * screen see the same session. `demo@petplate.app` stays in Mongo; a fresh
 * onboarding run mints a new `x-dev-user` email instead of wiping it.
 */
let devSessionSignedIn = true;
const devSessionListeners = new Set<() => void>();

function notifyDevSession(): void {
  for (const listener of devSessionListeners) listener();
}

/**
 * The synthetic `EXPO_PUBLIC_DEV_USER` session. It never touches
 * `react-native-auth0`, so it runs in Expo Go. Sign-out is local only.
 */
function useDevAuth(): AuthSession {
  const queryClient = useQueryClient();
  const [, rerender] = useState(0);

  useEffect(() => {
    const listener = (): void => rerender((n) => n + 1);
    devSessionListeners.add(listener);
    return () => {
      devSessionListeners.delete(listener);
    };
  }, []);

  // No bearer token exists — `api.ts` sends the `x-dev-user` header instead.
  useEffect(() => registerAccessTokenProvider(async () => null), []);

  useEffect(() => {
    if (devSessionSignedIn) {
      displayName = getActiveDevUser() === config.devUser ? 'Dev User' : 'New user';
    }
  }, []);

  const signIn = useCallback(async (opts?: SignInOptions): Promise<void> => {
    // `connection`/`screenHint` are meaningless without a tenant, but the sign-in screen
    // still sends them — a fresh signup is the one that maps onto a brand-new dev user.
    const fresh = opts?.fresh === true || opts?.screenHint === 'signup';
    const email = fresh ? `onboard.${Date.now()}@petplate.app` : (config.devUser ?? '');
    setActiveDevUser(email);
    displayName = fresh ? 'New user' : 'Dev User';
    queryClient.clear();
    devSessionSignedIn = true;
    notifyDevSession();
    await queryClient.invalidateQueries({ queryKey: ['me'] });
  }, [queryClient]);

  const signOut = useCallback(async (): Promise<void> => {
    setActiveDevUser(null);
    displayName = null;
    queryClient.clear();
    devSessionSignedIn = false;
    notifyDevSession();
  }, [queryClient]);

  const email = getActiveDevUser();
  return useMemo<AuthSession>(
    () => ({
      isAuthenticated: devSessionSignedIn,
      isLoading: false,
      name: displayName,
      email,
      isDevSession: true,
      error: null,
      signIn,
      signOut,
    }),
    [email, signIn, signOut],
  );
}

/**
 * Picked once at module scope, not per render: `config.devUser` is inlined at bundle
 * time and cannot change while the process lives, so hook order stays stable.
 */
export const useAuth: () => AuthSession = config.devUser ? useDevAuth : useRealAuth;
