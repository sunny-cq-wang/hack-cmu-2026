import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { config } from './config.js';
import { log } from './lib/log.js';
import { errorHandler } from './lib/errors.js';
import type { AuthVars } from './lib/auth.js';
import { connectDb } from './db/connect.js';
import { devRoutes } from './dev/routes.js';
import { avatarRoutes } from './routes/avatar.js';
import { voiceRoutes } from './routes/voice.js';
import { petsRoutes } from './routes/pets.js';
import { weighinsRoutes } from './routes/weighins.js';
import { scoresRoutes } from './routes/scores.js';

export const app = new Hono<AuthVars>();

app.onError(errorHandler);

app.get('/api/health', (c) => c.json({ ok: true, demoMode: config.DEMO_MODE }));

app.route('/api', devRoutes);
app.route('/api/avatar', avatarRoutes);
app.route('/api/voice', voiceRoutes);
app.route('/api/pets', petsRoutes);
app.route('/api/weighins', weighinsRoutes);
app.route('/api/scores', scoresRoutes);

async function main(): Promise<void> {
  await connectDb();
  serve({ fetch: app.fetch, port: config.PORT }, (info) => {
    log.info(
      { port: info.port, demoMode: config.DEMO_MODE, devBypassAuth: config.DEV_BYPASS_AUTH },
      'api listening',
    );
  });
}

// Skip the listener when imported by vitest.
if (process.env['VITEST'] === undefined) {
  void main();
}
