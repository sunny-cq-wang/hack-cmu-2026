/**
 * Mongoose-backed implementation of the same surface as `fileStore`.
 * TODO(P2): replace with P2's real repositories; keep the method names.
 */
import mongoose from 'mongoose';
import type { FeedingRecord, MealRecord, PetRecord, PhotoRecord, UserRecord } from './types.js';
import { FeedingModel, MealModel, PetModel, PhotoModel, UserModel } from './models/index.js';

const oid = (id: string): mongoose.Types.ObjectId | null =>
  mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;

const idStr = (value: unknown): string | null => (value ? String(value) : null);

// why: mongoose lean() documents are untyped bags; the mappers below are the type boundary.
/* eslint-disable @typescript-eslint/no-explicit-any */
const toUser = (doc: any): UserRecord => ({
  id: String(doc._id),
  auth0Sub: doc.auth0Sub ?? '',
  email: doc.email ?? '',
  name: doc.name ?? '',
  timezone: doc.timezone ?? 'America/New_York',
  onboardingComplete: Boolean(doc.onboardingComplete),
  petId: idStr(doc.petId),
  profile: doc.profile ?? null,
  targets: doc.targets ?? null,
});

const toPet = (doc: any): PetRecord => ({
  id: String(doc._id),
  userId: String(doc.userId),
  name: doc.name,
  species: doc.species,
  breed: doc.breed ?? null,
  sex: doc.sex ?? null,
  neutered: Boolean(doc.neutered),
  ageYears: doc.ageYears ?? null,
  weightKg: doc.weightKg,
  idealWeightKg: doc.idealWeightKg,
  activity: doc.activity ?? 'normal',
  food: doc.food ?? {},
  mealsPerDay: doc.mealsPerDay ?? 2,
  goal: doc.goal ?? 'maintain',
  targets: doc.targets ?? {},
  avatar: {
    status: doc.avatar?.status ?? 'none',
    sourcePhotoId: idStr(doc.avatar?.sourcePhotoId),
    neutralPhotoId: idStr(doc.avatar?.neutralPhotoId),
    thrivingPhotoId: idStr(doc.avatar?.thrivingPhotoId),
    droopingPhotoId: idStr(doc.avatar?.droopingPhotoId),
    celebrationVideoUrl: doc.avatar?.celebrationVideoUrl ?? null,
    stylePrompt: doc.avatar?.stylePrompt ?? '',
    voice: doc.avatar?.voice ?? 'eve',
    imagineJobs: doc.avatar?.imagineJobs ?? [],
  },
});

const toPhotoMeta = (doc: any): PhotoRecord => ({
  id: String(doc._id),
  userId: String(doc.userId),
  kind: doc.kind,
  contentType: doc.contentType ?? 'image/jpeg',
  width: doc.width ?? 0,
  height: doc.height ?? 0,
  bytes: doc.data?.length ?? 0,
  createdAt: (doc.createdAt ?? new Date()).toISOString?.() ?? new Date().toISOString(),
});

const toFeeding = (doc: any): FeedingRecord => ({
  id: String(doc._id),
  petId: String(doc.petId),
  userId: String(doc.userId),
  fedAt: new Date(doc.fedAt).toISOString(),
  dayKey: doc.dayKey,
  grams: doc.grams,
  kcal: doc.kcal,
  source: doc.source ?? 'tap',
});

const toMeal = (doc: any): MealRecord => ({
  id: String(doc._id),
  userId: String(doc.userId),
  loggedAt: new Date(doc.loggedAt).toISOString(),
  dayKey: doc.dayKey,
  kcal: doc.totals?.kcal ?? 0,
  proteinG: doc.totals?.proteinG ?? 0,
});

export const mongoStore = {
  async init(): Promise<void> {
    /* connection is owned by connect.ts */
  },

  async findUserById(id: string): Promise<UserRecord | null> {
    const _id = oid(id);
    if (!_id) return null;
    const doc = await UserModel.findById(_id).lean();
    return doc ? toUser(doc) : null;
  },

  async findOrCreateUser(auth0Sub: string, email: string, name: string, timezone: string): Promise<UserRecord> {
    const doc = await UserModel.findOneAndUpdate(
      { auth0Sub },
      { $setOnInsert: { auth0Sub, email, name, timezone } },
      { new: true, upsert: true },
    ).lean();
    return toUser(doc);
  },

  async updateUser(id: string, patch: Partial<UserRecord>): Promise<UserRecord | null> {
    const _id = oid(id);
    if (!_id) return null;
    const doc = await UserModel.findByIdAndUpdate(_id, { $set: patch }, { new: true }).lean();
    return doc ? toUser(doc) : null;
  },

  async findPetById(id: string): Promise<PetRecord | null> {
    const _id = oid(id);
    if (!_id) return null;
    const doc = await PetModel.findById(_id).lean();
    return doc ? toPet(doc) : null;
  },

  async findPetByUserId(userId: string): Promise<PetRecord | null> {
    const _id = oid(userId);
    if (!_id) return null;
    const doc = await PetModel.findOne({ userId: _id }).lean();
    return doc ? toPet(doc) : null;
  },

  async createPet(pet: Omit<PetRecord, 'id'>): Promise<PetRecord> {
    const created = await PetModel.create({ ...pet, userId: oid(pet.userId) });
    return toPet(created.toObject());
  },

  async patchPetAvatar(petId: string, patch: Partial<PetRecord['avatar']>): Promise<PetRecord | null> {
    const _id = oid(petId);
    if (!_id) return null;
    const $set: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) $set[`avatar.${key}`] = value;
    const doc = await PetModel.findByIdAndUpdate(_id, { $set }, { new: true }).lean();
    return doc ? toPet(doc) : null;
  },

  async storePhoto(
    userId: string,
    kind: PhotoRecord['kind'],
    data: Buffer,
    contentType: string,
    width: number,
    height: number,
  ): Promise<PhotoRecord> {
    const created = await PhotoModel.create({ userId: oid(userId), kind, data, contentType, width, height });
    return toPhotoMeta(created.toObject());
  },

  async getPhoto(id: string): Promise<{ meta: PhotoRecord; data: Buffer } | null> {
    const _id = oid(id);
    if (!_id) return null;
    const doc = await PhotoModel.findById(_id).lean();
    if (!doc) return null;
    return { meta: toPhotoMeta(doc), data: Buffer.from((doc as any).data) };
  },

  async createFeeding(feeding: Omit<FeedingRecord, 'id'>): Promise<FeedingRecord> {
    const created = await FeedingModel.create({
      ...feeding,
      petId: oid(feeding.petId),
      userId: oid(feeding.userId),
      fedAt: new Date(feeding.fedAt),
    });
    return toFeeding(created.toObject());
  },

  async feedingsForDay(petId: string, dayKeyValue: string): Promise<FeedingRecord[]> {
    const _id = oid(petId);
    if (!_id) return [];
    const docs = await FeedingModel.find({ petId: _id, dayKey: dayKeyValue }).lean();
    return docs.map(toFeeding);
  },

  async mealsForDay(userId: string, dayKeyValue: string): Promise<MealRecord[]> {
    const _id = oid(userId);
    if (!_id) return [];
    const docs = await MealModel.find({ userId: _id, dayKey: dayKeyValue }).lean();
    return docs.map(toMeal);
  },

  async createMeal(meal: Omit<MealRecord, 'id'>): Promise<MealRecord> {
    const created = await MealModel.create({
      userId: oid(meal.userId),
      loggedAt: new Date(meal.loggedAt),
      dayKey: meal.dayKey,
      slot: 'snack',
      source: 'manual',
      totals: { kcal: meal.kcal, proteinG: meal.proteinG },
    });
    return toMeal(created.toObject());
  },
};
