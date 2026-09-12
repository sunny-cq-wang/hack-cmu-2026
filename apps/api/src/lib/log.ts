import pino from 'pino';
import { config } from '../config.js';

export const log = pino({
  level: config.NODE_ENV === 'test' ? 'silent' : 'info',
  transport:
    config.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
      : undefined,
});

/**
 * Log every external API call with duration and success/failure (AGENTS.md §4.9).
 */
export async function timed<T>(
  name: string,
  fn: () => Promise<T>,
  extra: Record<string, unknown> = {},
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await fn();
    log.info({ ext: name, ms: Date.now() - startedAt, ok: true, ...extra }, `${name} ok`);
    return result;
  } catch (err) {
    log.warn(
      { ext: name, ms: Date.now() - startedAt, ok: false, err: (err as Error).message, ...extra },
      `${name} failed`,
    );
    throw err;
  }
}
