/**
 * The ONLY place in apps/api that reads process.env (AGENTS.md §4.5).
 */
import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Repo root .env — apps/api/src/config.ts → ../../../.env
const here = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.resolve(here, '../../../.env') });

const str = (key: string, fallback = ''): string => process.env[key]?.trim() || fallback;
const bool = (key: string, fallback = false): boolean => {
  const raw = process.env[key]?.trim().toLowerCase();
  return raw === undefined || raw === '' ? fallback : raw === 'true' || raw === '1';
};
const num = (key: string, fallback: number): number => {
  const parsed = Number(process.env[key]);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  NODE_ENV: str('NODE_ENV', 'development'),
  PORT: num('PORT', 3000),
  DEMO_MODE: bool('DEMO_MODE', false),
  DEV_BYPASS_AUTH: bool('DEV_BYPASS_AUTH', false),

  MONGODB_URI: str('MONGODB_URI'),

  AUTH0_DOMAIN: str('AUTH0_DOMAIN'),
  AUTH0_AUDIENCE: str('AUTH0_AUDIENCE'),

  XAI_API_KEY: str('XAI_API_KEY'),
  XAI_BASE_URL: str('XAI_BASE_URL', 'https://api.x.ai/v1'),
  GROK_VISION_MODEL: str('GROK_VISION_MODEL', 'grok-4.6'),
  GROK_CHAT_MODEL: str('GROK_CHAT_MODEL', 'grok-4.6'),
  GROK_IMAGE_MODEL: str('GROK_IMAGE_MODEL', 'grok-imagine-image-2.0'),
  GROK_VIDEO_MODEL: str('GROK_VIDEO_MODEL', 'grok-imagine-video-1.5'),
  GROK_VOICE_MODEL: str('GROK_VOICE_MODEL', 'grok-voice-latest'),
  GROK_DEFAULT_VOICE: str('GROK_DEFAULT_VOICE', 'eve'),

  USDA_API_KEY: str('USDA_API_KEY', 'DEMO_KEY'),
} as const;

export const hasXaiKey = (): boolean => config.XAI_API_KEY.length > 0;
export const isProd = (): boolean => config.NODE_ENV === 'production';
