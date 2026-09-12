import mongoose from 'mongoose';
import { config } from '../config';
import { log } from '../lib/log';

// TODO(P2): replace — exact signature: connect(uri = config.MONGODB_URI): Promise<typeof mongoose>

export async function connect(uri = config.MONGODB_URI): Promise<typeof mongoose> {
  if (!uri) {
    log.warn('MONGODB_URI empty — skipping connect (P2 stub)');
    return mongoose;
  }
  if (mongoose.connection.readyState === 1) return mongoose;
  await mongoose.connect(uri);
  return mongoose;
}
