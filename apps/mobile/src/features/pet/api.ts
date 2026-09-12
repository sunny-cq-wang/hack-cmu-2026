import { z } from 'zod';
import { ApiErrorSchema } from '@petplate/shared';

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// TODO(P1): import { api } from '../../lib/api' and delete this wrapper.
export async function api<T>(
  path: string,
  init: RequestInit & { schema: z.ZodType<T>; multipart?: boolean },
): Promise<T> {
  const base = 'http://localhost:3000'; // TODO(P1): import { config } from '../../lib/config' and use config.apiBase
  const headers = new Headers(init.headers);
  if (!init.multipart && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  // TODO(P1): attach Auth0 access token via lib/auth getAccessToken()
  if (!headers.has('Authorization')) headers.set('x-dev-user', 'demo@petplate.app');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  const { schema, multipart: _mp, ...rest } = init;
  void _mp;
  const res = await fetch(`${base}/api${path}`, { ...rest, headers, signal: ctrl.signal });
  clearTimeout(timer);
  const json: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const parsed = ApiErrorSchema.safeParse(json);
    if (parsed.success) throw new ApiError(parsed.data.error.code, parsed.data.error.message, res.status);
    throw new ApiError('INTERNAL', 'Request failed', res.status);
  }
  return schema.parse(json);
}
