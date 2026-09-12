import { Hono } from 'hono';
import type { AuthVars } from '../lib/auth';

export const weighinsRoutes = new Hono<{ Variables: AuthVars }>();
