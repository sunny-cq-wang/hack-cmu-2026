import { Hono } from 'hono';
import type { AuthVars } from '../lib/auth';

export const scoresRoutes = new Hono<{ Variables: AuthVars }>();
