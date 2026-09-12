/**
 * Typed fetch client. TODO(P1): owns this file — P4 needs `api`, `ApiError`,
 * `authHeaders` and `apiUrl` with these signatures.
 */
import type { z } from 'zod';
import { ApiErrorSchema } from '@petplate/shared';
import { config } from './config';

const TIMEOUT_MS = 20_000;

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

/** Absolute URL for a path the API returned (e.g. `/api/photos/:id`). */
export const apiUrl = (pathOrUrl: string): string =>
  pathOrUrl.startsWith('http') ? pathOrUrl : `${config.apiBase}${pathOrUrl}`;

/**
 * TODO(P1): replace with the Auth0 access token from `getCredentials()`.
 * Until then the API's DEV_BYPASS_AUTH header stands in.
 */
export async function authHeaders(): Promise<Record<string, string>> {
  return { 'x-dev-user': config.devUser };
}

export interface ApiOptions<S extends z.ZodTypeAny> extends Omit<RequestInit, 'body'> {
  schema: S;
  body?: BodyInit | null;
  multipart?: boolean;
}

/**
 * Generic over the schema rather than over its type argument: `z.ZodType<T>`
 * would bind `T` to the schema's *input* type, making every `.default()` field
 * look optional at the call site.
 */
export async function api<S extends z.ZodTypeAny>(path: string, options: ApiOptions<S>): Promise<z.output<S>> {
  const { schema, multipart, headers, ...init } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${config.apiBase}/api${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        ...(await authHeaders()),
        // FormData must set its own multipart boundary.
        ...(multipart ? {} : { 'Content-Type': 'application/json' }),
        ...(headers as Record<string, string> | undefined),
      },
    });

    if (!res.ok) {
      const parsed = ApiErrorSchema.safeParse(await res.json().catch(() => null));
      if (parsed.success) throw new ApiError(parsed.data.error.code, parsed.data.error.message, res.status);
      throw new ApiError('INTERNAL', `Request to ${path} failed (${res.status})`, res.status);
    }

    // A zod failure here means contract drift — surface it, do not loosen the schema.
    return schema.parse(await res.json());
  } finally {
    clearTimeout(timer);
  }
}
