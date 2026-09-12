import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

const envCandidates = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '../../.env'),
  resolve(__dirname, '../../../.env'),
];
for (const path of envCandidates) {
  if (existsSync(path)) {
    loadDotenv({ path });
    break;
  }
}

const boolFromEnv = (defaultValue = false) =>
  z.preprocess((value) => {
    if (value === undefined || value === '') return defaultValue;
    return value === 'true' || value === true;
  }, z.boolean());

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DEMO_MODE: boolFromEnv(false),
  DEV_BYPASS_AUTH: boolFromEnv(false),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/petplate'),
  AUTH0_DOMAIN: z.string().default('example.us.auth0.com'),
  AUTH0_AUDIENCE: z.string().default('https://api.petplate.app'),
  XAI_API_KEY: z.string().default(''),
  GROK_VISION_MODEL: z.string().default('grok-4.6'),
  GROK_CHAT_MODEL: z.string().default('grok-4.6'),
  GROK_IMAGE_MODEL: z.string().default('grok-imagine-image'),
  GROK_VIDEO_MODEL: z.string().default('grok-imagine-video'),
  GROK_TTS_MODEL: z.string().default(''),
  GROK_STT_MODEL: z.string().default(''),
  GROK_DEFAULT_VOICE: z.string().default('Ara'),
  USDA_API_KEY: z.string().default('DEMO_KEY'),
  NUTRITIONIX_APP_ID: z.string().default(''),
  NUTRITIONIX_APP_KEY: z.string().default(''),
});

export const config = EnvSchema.parse(process.env);
export const isDemo = config.DEMO_MODE;
export type Config = z.infer<typeof EnvSchema>;
