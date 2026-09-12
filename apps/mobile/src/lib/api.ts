/**
 * The single HTTP boundary for the app.
 *
 * Everything crossing it is validated with a `@petplate/shared` zod schema
 * (AGENTS.md §4.2). A parse failure is contract drift: it is logged loudly and
 * turned into an error — never "fixed" by loosening the schema.
 */
import { ApiErrorSchema, ErrorCode } from '@petplate/shared';
import type { z } from 'zod';

import { config } from './config';
import { log } from './log';

export type ApiErrorCode = z.infer<typeof ErrorCode>;

/** docs/API_CONTRACTS.md §2 and §4: the app's default budget for one request. */
export const DEFAULT_TIMEOUT_MS = 20_000;
/** `POST /mealplans/generate` legitimately takes 10–25 s (Grok + USDA verification). */
export const LONG_TIMEOUT_MS = 40_000;

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * Generic over the *schema*, not its output: several shared schemas use `.default()`,
 * so their input and output types differ and `z.ZodType<T>` would infer the wrong one.
 */
export type ApiInit<S extends z.ZodTypeAny> = Omit<RequestInit, 'signal'> & {
  schema: S;
  /** `body` is a `FormData`; let fetch pick the multipart boundary itself. */
  multipart?: boolean;
  timeoutMs?: number;
};

/** Builds `?a=1&b=2`, skipping undefined values. Returns '' when nothing is set. */
export function qs(params: Record<string, string | number | boolean | undefined>): string {
  const pairs = Object.entries(params)
    .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return pairs.length > 0 ? `?${pairs.join('&')}` : '';
}

/**
 * Auth0 lives in a React hook, so `auth.ts` registers its token getter here on
 * mount. Null means "no session yet" and the request goes out unauthenticated.
 */
type AccessTokenProvider = () => Promise<string | null>;
let accessTokenProvider: AccessTokenProvider | null = null;

export function setAccessTokenProvider(provider: AccessTokenProvider | null): void {
  accessTokenProvider = provider;
}

/**
 * Set by `mock/index.ts` when `EXPO_PUBLIC_MOCK_API=true`. Nothing else may set it,
 * and it is never consulted unless `config.mockApi` is on.
 */
export type MockTransport = (
  method: string,
  path: string,
  body: unknown,
) => Promise<unknown> | unknown;
let mockTransport: MockTransport | null = null;

export function setMockTransport(transport: MockTransport | null): void {
  mockTransport = transport;
}

function codeForStatus(status: number): ApiErrorCode {
  switch (status) {
    case 400:
      return 'VALIDATION_ERROR';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'ONBOARDING_REQUIRED';
    case 429:
      return 'RATE_LIMITED';
    case 502:
      return 'UPSTREAM_ERROR';
    case 504:
      return 'UPSTREAM_TIMEOUT';
    default:
      return 'INTERNAL';
  }
}

function parseOrDrift<S extends z.ZodTypeAny>(
  path: string,
  schema: S,
  payload: unknown,
  status: number,
): z.infer<S> {
  const parsed = schema.safeParse(payload);
  if (parsed.success) {
    return parsed.data;
  }
  log.warn('api', 'contract drift — response did not match the shared schema', {
    path,
    issues: parsed.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      code: issue.code,
      message: issue.message,
    })),
  });
  throw new ApiError(
    'VALIDATION_ERROR',
    `The server's response for ${path} did not match the app's contract.`,
    status,
  );
}

/**
 * Absolute URL for a server-issued media path. The API hands back `/api/photos/<id>`
 * from `urlFor()`, which `<Image>` and `expo-video` cannot resolve on their own.
 */
export function apiUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return path.startsWith('/api/') ? `${config.apiBase}${path}` : `${config.apiBase}/api${path}`;
}

/**
 * Last headers `authHeaders()` resolved. `<Image source={{ uri, headers }}>` and
 * `expo-video` need headers synchronously, but the bearer token only arrives from an
 * async Auth0 call — so the snapshot is refreshed as a side effect of every request
 * rather than primed by a separate wiring step that can be forgotten.
 */
let lastAuthHeaders: Record<string, string> = config.devUser ? { 'x-dev-user': config.devUser } : {};
/** When `EXPO_PUBLIC_DEV_USER` is set, this is the email sent as `x-dev-user`. */
let activeDevUser: string | null = config.devUser;

/** Swap or clear the synthetic identity without rebuilding. Null = signed out. */
export function setActiveDevUser(email: string | null): void {
  activeDevUser = email;
  lastAuthHeaders = email ? { 'x-dev-user': email } : {};
}

export function getActiveDevUser(): string | null {
  return activeDevUser;
}

export async function authHeaders(): Promise<Record<string, string>> {
  if (config.devUser) {
    // Pairs with DEV_BYPASS_AUTH=true on the API (.env.example).
    lastAuthHeaders = activeDevUser ? { 'x-dev-user': activeDevUser } : {};
    return lastAuthHeaders;
  }
  const token = await accessTokenProvider?.();
  lastAuthHeaders = token ? { Authorization: `Bearer ${token}` } : {};
  return lastAuthHeaders;
}

/**
 * Synchronous view of `authHeaders()`. Empty until the first request resolves, which
 * is always well before a server-issued media URL exists to load.
 */
export function authHeadersSnapshot(): Record<string, string> {
  return lastAuthHeaders;
}

/** Query-string twin of `authHeaders` for `expo-image`, which cannot send custom headers. */
export function photoAuthQuery(headers: Record<string, string>): string {
  const params = new URLSearchParams();
  if (headers['x-dev-user']) {
    params.set('devUser', headers['x-dev-user']);
  }
  const bearer = headers.Authorization;
  if (bearer?.startsWith('Bearer ')) {
    params.set('access_token', bearer.slice('Bearer '.length));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

/**
 * Absolute, credentialed URL for a server-issued media path.
 *
 * The photo and video routes require auth, and the image/video views that consume
 * them are not uniformly able to attach a header — `expo-image` cannot at all, and a
 * header-only `<Image>` source silently renders nothing when the request 401s. The
 * API accepts the same credentials as query parameters for exactly this reason
 * (`devUser` / `access_token`), so put them in the URL and every consumer works.
 */
export function mediaUrl(pathOrUrl: string): string {
  return `${apiUrl(pathOrUrl)}${photoAuthQuery(authHeadersSnapshot())}`;
}

export async function api<S extends z.ZodTypeAny>(path: string, init: ApiInit<S>): Promise<z.infer<S>> {
  const { schema, multipart = false, timeoutMs = DEFAULT_TIMEOUT_MS, headers, ...rest } = init;
  const method = (rest.method ?? 'GET').toUpperCase();

  if (config.mockApi) {
    if (!mockTransport) {
      throw new ApiError('INTERNAL', 'EXPO_PUBLIC_MOCK_API is on but no mock transport is registered.', 0);
    }
    const payload = await mockTransport(method, path, rest.body);
    return parseOrDrift(path, schema, payload, 200);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  let res: Response;
  try {
    res = await fetch(`${config.apiBase}/api${path}`, {
      ...rest,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(rest.body !== undefined && !multipart ? { 'Content-Type': 'application/json' } : {}),
        ...(await authHeaders()),
        ...headers,
      },
    });
  } catch (error) {
    const aborted = controller.signal.aborted;
    log.warn('api', aborted ? 'request timed out' : 'network error', {
      path,
      method,
      ms: Date.now() - startedAt,
      // why: without the cause a multipart failure is indistinguishable from being
      // offline — both surface as the same generic notice.
      cause: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    });
    throw aborted
      ? new ApiError('UPSTREAM_TIMEOUT', `${path} timed out after ${timeoutMs} ms.`, 504)
      : new ApiError('UPSTREAM_ERROR', `Could not reach the PetPlate API. Check your connection.`, 0);
  } finally {
    clearTimeout(timer);
  }

  log.info('api', 'request complete', { path, method, status: res.status, ms: Date.now() - startedAt });

  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    const envelope = ApiErrorSchema.safeParse(body);
    throw envelope.success
      ? new ApiError(envelope.data.error.code, envelope.data.error.message, res.status)
      : new ApiError(codeForStatus(res.status), `Request to ${path} failed (${res.status}).`, res.status);
  }

  if (res.status === 204) {
    return parseOrDrift(path, schema, undefined, res.status);
  }

  const body: unknown = await res.json();
  return parseOrDrift(path, schema, body, res.status);
}
