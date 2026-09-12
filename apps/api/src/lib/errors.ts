import type { Context } from 'hono';
import { ZodError, type z } from 'zod';
import { ErrorCode } from '@petplate/shared';
import { log } from './log';

// TODO(P2): replace — exact signature: class AppError extends Error { constructor(public code: ErrorCode, public status: number, message: string) } + app.onError mapper.

export type ErrorCodeName = z.infer<typeof ErrorCode>;

export class AppError extends Error {
  constructor(
    public code: ErrorCodeName,
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(err: Error, c: Context) {
  if (err instanceof AppError) {
    return c.json({ error: { code: err.code, message: err.message } }, err.status as 400);
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const path = first?.path.join('.') ?? '';
    const message = path ? `${path}: ${first?.message ?? 'invalid'}` : (first?.message ?? 'invalid');
    return c.json({ error: { code: 'VALIDATION_ERROR' as const, message } }, 400);
  }
  log.error({ err }, 'unhandled');
  return c.json({ error: { code: 'INTERNAL' as const, message: 'Internal error' } }, 500);
}
