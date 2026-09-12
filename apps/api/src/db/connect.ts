import mongoose from 'mongoose';
import { config } from '../config';
import { log } from '../lib/log';

export async function connectDb(): Promise<void> {
  mongoose.set('autoIndex', config.NODE_ENV !== 'production');
  await mongoose.connect(config.MONGODB_URI);
  log.info('mongodb connected');
}
