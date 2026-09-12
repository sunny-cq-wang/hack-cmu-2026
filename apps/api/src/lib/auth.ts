import type { MiddlewareHandler } from 'hono';
import { config } from '../config';
import { AppError } from './errors';
import { User } from '../db/models/user';
import type { UserDoc } from '../db/models/user';

export type AuthVars = { userId: string; auth0Sub: string; user: UserDoc };

// TODO(P2): replace — exact signature:
//   authMiddleware: MiddlewareHandler<{ Variables: { userId: string; auth0Sub: string; user: UserDoc } }>
//   Verify Auth0 JWT via JWKS. DEV_BYPASS_AUTH + x-dev-user header skips JWT (dev only).

export const authMiddleware: MiddlewareHandler<{ Variables: AuthVars }> = async (c, next) => {
  const email = c.req.header('x-dev-user');
  if (config.DEV_BYPASS_AUTH && email) {
    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        auth0Sub: `dev|${email}`,
        email,
        name: email.split('@')[0] ?? email,
        timezone: 'America/New_York',
        onboardingComplete: false,
        petId: null,
        profile: null,
        targets: null,
      });
    }
    c.set('userId', String(user._id));
    c.set('auth0Sub', user.auth0Sub);
    c.set('user', user as unknown as UserDoc);
    await next();
    return;
  }
  throw new AppError('UNAUTHORIZED', 401, 'Missing bearer token');
};
