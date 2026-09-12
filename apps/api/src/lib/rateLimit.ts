import type { MiddlewareHandler } from 'hono';
import { AppError } from './errors';
import type { AppEnv } from './auth';

const hits = new Map<string, number[]>();

/** Stretch: 60 requests / minute per authenticated user. */
export const rateLimit: MiddlewareHandler<AppEnv> = async (c, next) => {
  const id = c.get('userId') || c.req.header('x-forwarded-for') || 'anon';
  const now = Date.now();
  const window = (hits.get(id) ?? []).filter((t) => now - t < 60_000);
  if (window.length >= 60) {
    throw new AppError('RATE_LIMITED', 429, 'Too many requests');
  }
  window.push(now);
  hits.set(id, window);
  await next();
};
