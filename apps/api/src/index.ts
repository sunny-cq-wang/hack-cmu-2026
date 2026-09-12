import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { config } from './config';
import { connect } from './db/connect';
import { errorHandler } from './lib/errors';
import { authMiddleware } from './lib/auth';
import { log } from './lib/log';
import { petsRoutes } from './routes/pets';
import { weighinsRoutes } from './routes/weighins';
import { scoresRoutes } from './routes/scores';

const app = new Hono();
app.onError(errorHandler);
app.get('/api/health', (c) => c.json({ ok: true, demoMode: config.DEMO_MODE }));

const api = new Hono();
api.use('*', authMiddleware);
api.route('/pets', petsRoutes);
api.route('/weighins', weighinsRoutes);
api.route('/scores', scoresRoutes);
app.route('/api', api);

async function main() {
  await connect();
  serve({ fetch: app.fetch, port: config.PORT }, () => {
    log.info({ port: config.PORT }, 'api listening');
  });
}

main().catch((err) => {
  log.error({ err }, 'failed to start');
  process.exit(1);
});

export { app };
