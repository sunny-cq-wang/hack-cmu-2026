/**
 * On-disk fallback store used when MONGODB_URI is empty.
 *
 * Persistence (not just an in-memory map) is required: the P4 acceptance check
 * restarts the API mid-pipeline and expects finished avatar states to be reused.
 *
 * TODO(P2): delete once Atlas is wired; the `store` facade keeps callers unchanged.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { FeedingRecord, MealRecord, PetRecord, PhotoRecord, UserRecord } from './types.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(here, '../../.data');
const PHOTO_DIR = path.join(DATA_DIR, 'photos');
const DB_FILE = path.join(DATA_DIR, 'store.json');

interface Snapshot {
  users: UserRecord[];
  pets: PetRecord[];
  photos: PhotoRecord[];
  feedings: FeedingRecord[];
  meals: MealRecord[];
}

const empty = (): Snapshot => ({ users: [], pets: [], photos: [], feedings: [], meals: [] });

let snapshot: Snapshot = empty();
let loaded = false;
let writeChain: Promise<void> = Promise.resolve();

export const newId = (): string => crypto.randomBytes(12).toString('hex');

async function load(): Promise<void> {
  if (loaded) return;
  await fs.mkdir(PHOTO_DIR, { recursive: true });
  try {
    snapshot = { ...empty(), ...(JSON.parse(await fs.readFile(DB_FILE, 'utf8')) as Snapshot) };
  } catch {
    snapshot = empty();
  }
  loaded = true;
}

/** Serialize writes so concurrent pipeline steps cannot clobber each other. */
function flush(): Promise<void> {
  writeChain = writeChain.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(DB_FILE, JSON.stringify(snapshot, null, 2));
  });
  return writeChain;
}

export const fileStore = {
  async init(): Promise<void> {
    await load();
  },

  async findUserById(id: string): Promise<UserRecord | null> {
    await load();
    return snapshot.users.find((u) => u.id === id) ?? null;
  },

  async findOrCreateUser(auth0Sub: string, email: string, name: string, timezone: string): Promise<UserRecord> {
    await load();
    const existing = snapshot.users.find((u) => u.auth0Sub === auth0Sub);
    if (existing) return existing;
    const user: UserRecord = {
      id: newId(),
      auth0Sub,
      email,
      name,
      timezone,
      onboardingComplete: false,
      petId: null,
      profile: null,
      targets: null,
    };
    snapshot.users.push(user);
    await flush();
    return user;
  },

  async updateUser(id: string, patch: Partial<UserRecord>): Promise<UserRecord | null> {
    await load();
    const user = snapshot.users.find((u) => u.id === id);
    if (!user) return null;
    Object.assign(user, patch);
    await flush();
    return user;
  },

  async findPetById(id: string): Promise<PetRecord | null> {
    await load();
    return snapshot.pets.find((p) => p.id === id) ?? null;
  },

  async findPetByUserId(userId: string): Promise<PetRecord | null> {
    await load();
    return snapshot.pets.find((p) => p.userId === userId) ?? null;
  },

  async createPet(pet: Omit<PetRecord, 'id'>): Promise<PetRecord> {
    await load();
    const record: PetRecord = { ...pet, id: newId() };
    snapshot.pets.push(record);
    await flush();
    return record;
  },

  /** Shallow-merges the avatar sub-doc so each pipeline step persists immediately. */
  async patchPetAvatar(petId: string, patch: Partial<PetRecord['avatar']>): Promise<PetRecord | null> {
    await load();
    const pet = snapshot.pets.find((p) => p.id === petId);
    if (!pet) return null;
    pet.avatar = { ...pet.avatar, ...patch };
    await flush();
    return pet;
  },

  async storePhoto(
    userId: string,
    kind: PhotoRecord['kind'],
    data: Buffer,
    contentType: string,
    width: number,
    height: number,
  ): Promise<PhotoRecord> {
    await load();
    const record: PhotoRecord = {
      id: newId(),
      userId,
      kind,
      contentType,
      width,
      height,
      bytes: data.byteLength,
      createdAt: new Date().toISOString(),
    };
    await fs.mkdir(PHOTO_DIR, { recursive: true });
    await fs.writeFile(path.join(PHOTO_DIR, record.id), data);
    snapshot.photos.push(record);
    await flush();
    return record;
  },

  async getPhoto(id: string): Promise<{ meta: PhotoRecord; data: Buffer } | null> {
    await load();
    const meta = snapshot.photos.find((p) => p.id === id);
    if (!meta) return null;
    try {
      return { meta, data: await fs.readFile(path.join(PHOTO_DIR, id)) };
    } catch {
      return null;
    }
  },

  async createFeeding(feeding: Omit<FeedingRecord, 'id'>): Promise<FeedingRecord> {
    await load();
    const record: FeedingRecord = { ...feeding, id: newId() };
    snapshot.feedings.push(record);
    await flush();
    return record;
  },

  async feedingsForDay(petId: string, dayKeyValue: string): Promise<FeedingRecord[]> {
    await load();
    return snapshot.feedings.filter((f) => f.petId === petId && f.dayKey === dayKeyValue);
  },

  async mealsForDay(userId: string, dayKeyValue: string): Promise<MealRecord[]> {
    await load();
    return snapshot.meals.filter((m) => m.userId === userId && m.dayKey === dayKeyValue);
  },

  async createMeal(meal: Omit<MealRecord, 'id'>): Promise<MealRecord> {
    await load();
    const record: MealRecord = { ...meal, id: newId() };
    snapshot.meals.push(record);
    await flush();
    return record;
  },
};
