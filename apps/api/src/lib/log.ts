import pino from 'pino';

// TODO(P2): replace — exact signature: pino logger used for every external API call (duration + success/failure).
export const log = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
});
