import { AppError } from './errors.js';

export class TimeoutError extends Error {
  constructor(url: string, ms: number) {
    super(`Request to ${url} timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * Every external call has a timeout (AGENTS.md §4.4). Callers decide the fallback.
 */
export async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new TimeoutError(url, ms);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Read an error body without letting a huge/HTML response flood the logs. */
export async function readErrorBody(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return '<unreadable body>';
  }
}

export function upstreamError(label: string, status: number, body: string): AppError {
  return new AppError('UPSTREAM_ERROR', `${label} failed (${status}): ${body}`);
}
