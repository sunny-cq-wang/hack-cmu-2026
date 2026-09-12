import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { config } from './config';
import { connectDb } from './db/connect';
import { errorHandler } from './lib/errors';
import { log } from './lib/log';

const app = new Hono();
app.onError(errorHandler);

const api = new Hono();
api.get('/health', (c) => c.json({ ok: true, demoMode: config.DEMO_MODE }));
app.route('/api', api);

export { app };

async function main(): Promise<void> {
  await connectDb();
  serve({ fetch: app.fetch, port: config.PORT }, (info) => {
    log.info({ port: info.port, demoMode: config.DEMO_MODE }, 'api listening');
  });
}

if (require.main === module) {
  main().catch((err: unknown) => {
    log.error({ err }, 'failed to start');
    process.exit(1);
  });
}
