import type { ErrorHandler } from 'hono';
import { ZodError } from 'zod';
import { log } from './log';

export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'ONBOARDING_REQUIRED'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_ERROR'
  | 'RATE_LIMITED'
  | 'INTERNAL';

const STATUS_FOR_CODE: Record<ErrorCode, number> = {
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
  public status: number;

  constructor(code: ErrorCode, status: number, message: string);
  constructor(code: ErrorCode, message: string);
  constructor(
    public code: ErrorCode,
    statusOrMessage: number | string,
    maybeMessage?: string,
  ) {
    const status = typeof statusOrMessage === 'number' ? statusOrMessage : STATUS_FOR_CODE[code];
    super(typeof statusOrMessage === 'number' ? (maybeMessage ?? code) : statusOrMessage);
    this.status = status;
    this.name = 'AppError';
  }
}

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof AppError) {
    return c.json(
      { error: { code: err.code, message: err.message } },
      err.status as 400 | 401 | 403 | 404 | 409 | 429 | 500 | 502 | 504,
    );
  }
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    const path = issue?.path.join('.') ?? '';
    const message = path ? `${path} ${issue?.message ?? 'invalid'}` : (issue?.message ?? 'Invalid request');
    return c.json({ error: { code: 'VALIDATION_ERROR', message } }, 400);
  }
  log.error({ err }, 'unhandled error');
  return c.json({ error: { code: 'INTERNAL', message: 'Internal server error' } }, 500);
};
