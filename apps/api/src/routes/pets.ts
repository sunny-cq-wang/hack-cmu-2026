import { Hono } from 'hono';
import type { AuthVars } from '../lib/auth';

export const petsRoutes = new Hono<{ Variables: AuthVars }>();
