import { Hono } from 'hono';
import { authMiddleware, type AppEnv } from '../lib/auth';
import { rateLimit } from '../lib/rateLimit';
import { fetchOwned } from '../services/photos';

export const photoRoutes = new Hono<AppEnv>();
photoRoutes.use('*', authMiddleware);
photoRoutes.use('*', rateLimit);

photoRoutes.get('/:id', async (c) => {
  const photo = await fetchOwned(c.req.param('id'), c.get('userId'));
  return new Response(new Uint8Array(photo.data), {
    status: 200,
    headers: {
      'Content-Type': photo.contentType,
      'Cache-Control': 'private, max-age=86400',
    },
  });
});
