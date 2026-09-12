import mongoose from 'mongoose';
import { config } from '../config';
import { log } from '../lib/log';
import { mongoStore } from './mongoStore';

export async function connectDb(): Promise<void> {
  mongoose.set('autoIndex', config.NODE_ENV !== 'production');
  await mongoose.connect(config.MONGODB_URI);
  log.info('mongodb connected');
}

export const isMongoConnected = (): boolean => mongoose.connection.readyState === 1;

/**
 * Record-shaped facade the avatar and voice services read through. It maps onto
 * the same Mongoose models every other route uses, so there is one source of truth.
 */
export const store = mongoStore;
export type Store = typeof mongoStore;
