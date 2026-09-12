/**
 * Auth0 JWT middleware. TODO(P2): owns this file; P4 only needs `c.var.userId`.
 */
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { MiddlewareHandler } from 'hono';
import { config, isProd } from '../config.js';
import { store as db } from '../db/connect.js';
import { AppError } from './errors.js';
import { log } from './log.js';

export interface AuthVars {
  Variables: {
    userId: string;
    auth0Sub: string;
    timezone: string;
  };
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${config.AUTH0_DOMAIN}/.well-known/jwks.json`));
  }
  return jwks;
}

export const requireAuth: MiddlewareHandler<AuthVars> = async (c, next) => {
  const devUser = c.req.header('x-dev-user');
  // Dev shortcut, never in production (INTEGRATIONS §3).
  if (config.DEV_BYPASS_AUTH && !isProd() && devUser) {
    const user = await db.findOrCreateUser(`dev|${devUser}`, devUser, devUser.split('@')[0] ?? 'Dev', 'America/New_York');
    c.set('userId', user.id);
    c.set('auth0Sub', user.auth0Sub);
    c.set('timezone', user.timezone);
    return next();
  }

  const header = c.req.header('authorization') ?? '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new AppError('UNAUTHORIZED', 'Missing bearer token');
  if (!config.AUTH0_DOMAIN) throw new AppError('UNAUTHORIZED', 'Auth is not configured on this server');

  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: `https://${config.AUTH0_DOMAIN}/`,
      audience: config.AUTH0_AUDIENCE,
    });
    const sub = String(payload.sub ?? '');
    if (!sub) throw new AppError('UNAUTHORIZED', 'Token has no subject');
    const email = String(payload['email'] ?? '');
    const user = await db.findOrCreateUser(sub, email, String(payload['name'] ?? email), 'America/New_York');
    c.set('userId', user.id);
    c.set('auth0Sub', sub);
    c.set('timezone', user.timezone);
    return next();
  } catch (err) {
    if (err instanceof AppError) throw err;
    log.warn({ err: (err as Error).message }, 'jwt verify failed');
    throw new AppError('UNAUTHORIZED', 'Invalid or expired token');
  }
};
