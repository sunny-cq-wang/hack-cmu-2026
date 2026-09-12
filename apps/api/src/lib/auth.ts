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
    user: UserDoc;
  };
};

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${config.AUTH0_DOMAIN}/.well-known/jwks.json`));
  }
  return jwks;
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
    user = await UserModel.create({
      auth0Sub,
      email: email || '',
      name: name || '',
      timezone: 'America/New_York',
    });
  } else {
    if (!user.email && email) user.email = email;
    if (!user.name && name) user.name = name;
    await user.save();
  }
  return user as UserDoc;
}

export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (config.DEV_BYPASS_AUTH && config.NODE_ENV !== 'production') {
    const email = c.req.header('x-dev-user');
    if (email) {
      const local = email.split('@')[0] ?? 'dev';
      const user = await upsertUser(`dev|${email}`, email, local);
      c.set('userId', user._id.toString());
      c.set('auth0Sub', user.auth0Sub);
      c.set('user', user);
      await next();
      return;
    }
  }

  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) {
    throw new AppError('UNAUTHORIZED', 401, 'Missing bearer token');
  }
  const token = header.slice('Bearer '.length);
  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: `https://${config.AUTH0_DOMAIN}/`,
      audience: config.AUTH0_AUDIENCE,
    });
    const sub = payload.sub;
    if (!sub) throw new AppError('UNAUTHORIZED', 401, 'Token missing sub');
    const email = typeof payload.email === 'string' ? payload.email : '';
    const name = typeof payload.name === 'string' ? payload.name : '';
    const user = await upsertUser(sub, email, name);
    c.set('userId', user._id.toString());
    c.set('auth0Sub', sub);
    c.set('user', user);
    await next();
  } catch (err) {
    if (err instanceof AppError) throw err;
    log.warn({ err }, 'jwt verification failed');
    throw new AppError('UNAUTHORIZED', 401, 'Invalid token');
  }
};
