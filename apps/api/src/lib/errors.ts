import type { Context } from 'hono';
import { z } from 'zod';
import { ErrorCode } from '@petplate/shared';
import { log } from './log.js';

export type ErrorCodeValue = z.infer<typeof ErrorCode>;

const STATUS_BY_CODE: Record<ErrorCodeValue, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  ONBOARDING_REQUIRED: 409,
  UPSTREAM_TIMEOUT: 504,
  UPSTREAM_ERROR: 502,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCodeValue;
  readonly status: number;

  constructor(code: ErrorCodeValue, message: string, status?: number) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status ?? STATUS_BY_CODE[code];
  }
}

/** Hono `onError` handler producing the envelope from API_CONTRACTS.md. */
export function errorHandler(err: Error, c: Context): Response {
  if (err instanceof AppError) {
    return c.json({ error: { code: err.code, message: err.message } }, err.status as 400);
  }
  if (err instanceof z.ZodError) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: err.issues[0]?.message ?? 'Invalid request' } }, 400);
  }
  log.error({ err: err.message, stack: err.stack }, 'unhandled error');
  return c.json({ error: { code: 'INTERNAL', message: 'Something went wrong' } }, 500);
}
