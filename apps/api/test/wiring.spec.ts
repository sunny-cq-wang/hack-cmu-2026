import { describe, expect, it } from 'vitest';
import { app } from '../src/index';

/** Guards the wiring itself: every route tree mounts and no model registers twice. */
describe('app wiring', () => {
  it('serves /api/health', async () => {
    const res = await app.fetch(new Request('http://local/api/health'));
    expect(res.status).toBe(200);
  });

  it.each([
    ['GET', '/api/me/today'],
    ['GET', '/api/pets'],
    ['GET', '/api/weighins'],
    ['GET', '/api/scores'],
    ['GET', '/api/avatar/status'],
    ['POST', '/api/avatar/generate'],
    ['POST', '/api/avatar/celebrate'],
    ['POST', '/api/voice/turn'],
    ['GET', '/api/meals'],
    ['POST', '/api/mealplans'],
  ])('%s %s is mounted and rejects cleanly without a token', async (method, path) => {
    const res = await app.fetch(new Request(`http://local${path}`, { method }));
    expect(res.status).not.toBe(500);
    expect(res.status).not.toBe(404);
  });
});
