import { randomUUID } from 'node:crypto';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { config } from './config';
import { connectDb } from './db/connect';
import { errorHandler } from './lib/errors';
import { log } from './lib/log';
import { avatarRoutes } from './routes/avatar';
import { meRoutes } from './routes/me';
import { mealRoutes } from './routes/meals';
import { mealPlanRoutes } from './routes/mealplans';
import { nutritionRoutes } from './routes/nutrition';
import { petsRoutes } from './routes/pets';
import { photoRoutes } from './routes/photos';
import { scoresRoutes } from './routes/scores';
import { voiceRoutes } from './routes/voice';
import { weighinsRoutes } from './routes/weighins';

const app = new Hono();
app.use('*', async (c, next) => {
  const requestId = c.req.header('x-request-id') ?? randomUUID();
  c.header('x-request-id', requestId);
  await next();
});
app.onError(errorHandler);

const api = new Hono();
api.get('/health', (c) => c.json({ ok: true, demoMode: config.DEMO_MODE }));
api.route('/me', meRoutes);
api.route('/meals', mealRoutes);
api.route('/nutrition', nutritionRoutes);
api.route('/mealplans', mealPlanRoutes);
api.route('/pets', petsRoutes);
api.route('/photos', photoRoutes);
api.route('/weighins', weighinsRoutes);
api.route('/scores', scoresRoutes);
api.route('/avatar', avatarRoutes);
api.route('/voice', voiceRoutes);
app.route('/api', api);

export { app };

async function main(): Promise<void> {
  await connectDb();
  serve({ fetch: app.fetch, port: config.PORT }, (info) => {
    log.info(
      { port: info.port, demoMode: config.DEMO_MODE, devBypassAuth: config.DEV_BYPASS_AUTH },
      'api listening',
    );
  });
}

if (require.main === module) {
  main().catch((err: unknown) => {
    log.error({ err }, 'failed to start');
    process.exit(1);
  });
}
