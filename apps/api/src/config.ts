import { z } from 'zod';

// TODO(P2): replace — exact signature: parse every key in .env.example with zod; export typed `config` and `isDemo`.

const EnvSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(3000),
  DEMO_MODE: z.boolean().default(false),
  DEV_BYPASS_AUTH: z.boolean().default(false),
  MONGODB_URI: z.string().default(''),
  AUTH0_DOMAIN: z.string().default(''),
  AUTH0_AUDIENCE: z.string().default(''),
  GROK_DEFAULT_VOICE: z.string().default('Ara'),
});

export const config = EnvSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  DEMO_MODE: process.env.DEMO_MODE === 'true' || process.env.DEMO_MODE === '1',
  DEV_BYPASS_AUTH: process.env.DEV_BYPASS_AUTH === 'true' || process.env.DEV_BYPASS_AUTH === '1',
  MONGODB_URI: process.env.MONGODB_URI,
  AUTH0_DOMAIN: process.env.AUTH0_DOMAIN,
  AUTH0_AUDIENCE: process.env.AUTH0_AUDIENCE,
  GROK_DEFAULT_VOICE: process.env.GROK_DEFAULT_VOICE,
});

export const isDemo = config.DEMO_MODE;
