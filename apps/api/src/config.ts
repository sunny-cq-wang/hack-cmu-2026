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
  /**
   * The single account judges can enter without credentials, via `x-dev-user`. Unlike
   * DEV_BYPASS_AUTH this stays on in production because the demo is the product pitch,
   * so it is deliberately restricted to one exact address and nothing else. Clear it to
   * switch the demo door off entirely.
   */
  DEMO_LOGIN_EMAIL: z.string().default('demo@petplate.app'),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/petplate'),
  AUTH0_DOMAIN: z.string().default('example.us.auth0.com'),
  AUTH0_AUDIENCE: z.string().default('https://api.petplate.app'),
  XAI_API_KEY: z.string().default(''),
  XAI_BASE_URL: z.string().default('https://api.x.ai/v1'),
  GROK_VISION_MODEL: z.string().default('grok-4.6'),
  GROK_CHAT_MODEL: z.string().default('grok-4.6'),
  GROK_IMAGE_MODEL: z.string().default('grok-imagine-image-2.0'),
  GROK_VIDEO_MODEL: z.string().default('grok-imagine-video-1.5'),
  GROK_VOICE_MODEL: z.string().default('grok-voice-latest'),
  GROK_TTS_MODEL: z.string().default(''),
  GROK_STT_MODEL: z.string().default(''),
  // xAI voice_ids are lowercase and 'eve' is their default (INTEGRATIONS.md §4).
  GROK_DEFAULT_VOICE: z.string().default('eve'),
  USDA_API_KEY: z.string().default('DEMO_KEY'),
  NUTRITIONIX_APP_ID: z.string().default(''),
  NUTRITIONIX_APP_KEY: z.string().default(''),
});

export const config = EnvSchema.parse(process.env);
export const isDemo = config.DEMO_MODE;
export const hasXaiKey = (): boolean => config.XAI_API_KEY.length > 0;
export const isProd = (): boolean => config.NODE_ENV === 'production';
export type Config = z.infer<typeof EnvSchema>;
