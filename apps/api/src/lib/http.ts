import { AppError } from './errors';

export async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
      throw new AppError('UPSTREAM_TIMEOUT', 504, `Upstream request timed out after ${ms}ms`);
    }
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
  return new AppError('UPSTREAM_ERROR', 502, `${label} failed (${status}): ${body}`);
}
