import type { MiddlewareHandler } from 'hono';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from '../config';
import { UserModel, type UserDoc } from '../db/models';
import { AppError } from './errors';
import { log } from './log';

export type AppEnv = {
  Variables: {
    userId: string;
    auth0Sub: string;
    timezone: string;
    user: UserDoc;
  };
};

/** Alias the P3/P4 routes type their Hono instances with. */
export type AuthVars = AppEnv;

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${config.AUTH0_DOMAIN}/.well-known/jwks.json`));
  }
  return jwks;
}

/** Mongo's unique-index violation, the only create() failure worth retrying. */
function isDuplicateKey(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 11000;
}

async function upsertUser(auth0Sub: string, email: string, name: string): Promise<UserDoc> {
  let user = await UserModel.findOne({ auth0Sub });
  if (!user && email) {
    user = await UserModel.findOne({ email });
    if (user && user.auth0Sub !== auth0Sub) {
      user.auth0Sub = auth0Sub;
    }
  }
  if (!user) {
    try {
      user = await UserModel.create({
        auth0Sub,
        email: email || '',
        name: name || '',
        timezone: 'America/New_York',
      });
    } catch (err) {
      // A first sign-in fires several authenticated requests at once (bootstrap and
      // today race on the very first render), so two of them can both miss the
      // findOne above and both insert. The unique index on auth0Sub means exactly
      // one wins; the loser adopts the row the winner just wrote instead of 500ing.
      if (!isDuplicateKey(err)) throw err;
      const won = await UserModel.findOne({ auth0Sub });
      if (!won) throw err;
      user = won;
    }
  } else {
    if (!user.email && email) user.email = email;
    if (!user.name && name) user.name = name;
    await user.save();
  }
  return user as UserDoc;
}

export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  // Query form is for expo-image / <Image>, which cannot set custom headers.
  const devUser = c.req.header('x-dev-user') ?? c.req.query('devUser');

  // Two separate doors, and the difference matters. DEV_BYPASS_AUTH trusts *any* address
  // and is therefore development-only; the demo door trusts exactly one address and so
  // can stay open in production. Compared case-insensitively because the header is
  // retyped by hand often enough to make casing an unreliable thing to depend on.
  const demoEmail = config.DEMO_LOGIN_EMAIL.trim().toLowerCase();
  const isDemoLogin = demoEmail.length > 0 && devUser?.trim().toLowerCase() === demoEmail;
  const isDevLogin = config.DEV_BYPASS_AUTH && config.NODE_ENV !== 'production';

  if (isDemoLogin || isDevLogin) {
    const email = isDemoLogin ? demoEmail : devUser;
    if (email) {
      const local = email.split('@')[0] ?? 'dev';
      const user = await upsertUser(`dev|${email}`, email, local);
      c.set('userId', user._id.toString());
      c.set('auth0Sub', user.auth0Sub);
      c.set('timezone', user.timezone);
      c.set('user', user);
      await next();
      return;
    }
  }

  const queryToken = c.req.query('access_token');
  const header =
    c.req.header('Authorization') ?? (queryToken ? `Bearer ${queryToken}` : undefined);
  if (!header?.startsWith('Bearer ')) {
    throw new AppError('UNAUTHORIZED', 401, 'Missing bearer token');
  }
  const token = header.slice('Bearer '.length);

  // Only the verify call may be translated into a 401. Everything after it — the user
  // upsert and the whole downstream handler — has already proved the caller's identity,
  // so letting those errors land here would report a database fault or a route bug as
  // "Invalid token" and send the client off to re-authenticate for no reason.
  let payload: Awaited<ReturnType<typeof jwtVerify>>['payload'];
  try {
    ({ payload } = await jwtVerify(token, getJwks(), {
      issuer: `https://${config.AUTH0_DOMAIN}/`,
      audience: config.AUTH0_AUDIENCE,
    }));
  } catch (err) {
    log.warn({ err }, 'jwt verification failed');
    throw new AppError('UNAUTHORIZED', 401, 'Invalid token');
  }

  const sub = payload.sub;
  if (!sub) throw new AppError('UNAUTHORIZED', 401, 'Token missing sub');
  const email = typeof payload.email === 'string' ? payload.email : '';
  const name = typeof payload.name === 'string' ? payload.name : '';
  const user = await upsertUser(sub, email, name);
  c.set('userId', user._id.toString());
  c.set('auth0Sub', sub);
  c.set('timezone', user.timezone);
  c.set('user', user);
  await next();
};

/** P3/P4 routes import this name; same middleware. */
export const requireAuth = authMiddleware;
