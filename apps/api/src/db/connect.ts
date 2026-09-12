import mongoose from 'mongoose';
import { config } from '../config.js';
import { log } from '../lib/log.js';
import { fileStore } from './fileStore.js';
import { mongoStore } from './mongoStore.js';

export type Store = typeof fileStore;

let active: Store = fileStore;
let mongoConnected = false;

/**
 * Connects to Atlas when MONGODB_URI is set; otherwise falls back to the on-disk
 * store so the API boots with no external dependencies. Never throws.
 */
export async function connectDb(): Promise<void> {
  if (!config.MONGODB_URI) {
    log.warn('MONGODB_URI empty — using on-disk fallback store (apps/api/.data)');
    await fileStore.init();
    return;
  }
  try {
    await mongoose.connect(config.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      autoIndex: config.NODE_ENV !== 'production',
    });
    active = mongoStore as unknown as Store;
    mongoConnected = true;
    log.info('mongo connected');
  } catch (err) {
    log.error({ err: (err as Error).message }, 'mongo connect failed — falling back to on-disk store');
    await fileStore.init();
  }
}

export const isMongoConnected = (): boolean => mongoConnected;

/**
 * Facade every caller uses. Proxied so a late Mongo connection is picked up
 * without callers holding a stale reference.
 */
export const store: Store = new Proxy({} as Store, {
  get: (_target, prop) => active[prop as keyof Store],
});
