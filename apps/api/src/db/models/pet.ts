import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import type { Pet as PetApi } from '@petplate/shared';

// TODO(P2): replace — exact signature: Mongoose Pet model per DATA_MODEL §2 with timestamps, userId index, and toApi() mapping _id → id, photo ids → /api/photos/<id> URLs.

const PetSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true },
    species: { type: String, enum: ['dog', 'cat', 'virtual'], required: true },
    breed: { type: String, default: null },
    sex: { type: String, enum: ['male', 'female', null], default: null },
    neutered: { type: Boolean, required: true, default: true },
    ageYears: { type: Number, default: null },
    weightKg: { type: Number, required: true },
    idealWeightKg: { type: Number, required: true },
    activity: { type: String, enum: ['low', 'normal', 'high'], required: true, default: 'normal' },
    goal: { type: String, enum: ['lose', 'maintain'], required: true },
    food: {
      name: { type: String, default: 'Dry food' },
      kcalPerCup: { type: Number, default: 375 },
      gramsPerCup: { type: Number, default: 110 },
    },
    mealsPerDay: { type: Number, default: 2 },
    targets: { type: Schema.Types.Mixed, required: true },
    avatar: {
      status: { type: String, enum: ['none', 'generating', 'ready', 'failed'], default: 'none' },
      sourcePhotoId: { type: Schema.Types.ObjectId, default: null },
      neutralPhotoId: { type: Schema.Types.ObjectId, default: null },
      thrivingPhotoId: { type: Schema.Types.ObjectId, default: null },
      droopingPhotoId: { type: Schema.Types.ObjectId, default: null },
      celebrationVideoUrl: { type: String, default: null },
      stylePrompt: { type: String, default: '' },
      voice: { type: String, default: 'Ara' },
      imagineJobs: { type: [Schema.Types.Mixed], default: [] },
    },
  },
  { timestamps: true },
);

function iso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  return typeof d === 'string' ? d : d.toISOString();
}

function photoUrl(id: Types.ObjectId | null | undefined): string | null {
  return id ? `/api/photos/${String(id)}` : null;
}

PetSchema.methods.toApi = function toApi(): PetApi {
  const targets = this.targets ?? {};
  return {
    id: String(this._id),
    userId: String(this.userId),
    name: this.name,
    species: this.species,
    breed: this.breed ?? null,
    sex: this.sex ?? null,
    neutered: this.neutered,
    ageYears: this.ageYears ?? null,
    weightKg: this.weightKg,
    idealWeightKg: this.idealWeightKg,
    activity: this.activity,
    food: {
      name: this.food?.name ?? 'Dry food',
      kcalPerCup: this.food?.kcalPerCup ?? 375,
      gramsPerCup: this.food?.gramsPerCup ?? 110,
    },
    mealsPerDay: this.mealsPerDay ?? targets.mealsPerDay ?? 2,
    goal: this.goal,
    targets: {
      rerKcal: targets.rerKcal,
      merFactor: targets.merFactor,
      baseKcal: targets.baseKcal,
      adaptivePct: targets.adaptivePct,
      kcal: targets.kcal,
      portionGramsPerDay: targets.portionGramsPerDay,
      mealsPerDay: targets.mealsPerDay ?? this.mealsPerDay ?? 2,
      computedAt: iso(targets.computedAt) ?? new Date().toISOString(),
      lastAdjustedAt: iso(targets.lastAdjustedAt),
    },
    avatar: {
      status: this.avatar?.status ?? 'none',
      neutralUrl: photoUrl(this.avatar?.neutralPhotoId),
      thrivingUrl: photoUrl(this.avatar?.thrivingPhotoId),
      droopingUrl: photoUrl(this.avatar?.droopingPhotoId),
      celebrationVideoUrl: this.avatar?.celebrationVideoUrl ?? null,
      voice: this.avatar?.voice ?? 'Ara',
    },
  };
};

export type PetDoc = InferSchemaType<typeof PetSchema> & {
  _id: Types.ObjectId;
  toApi: () => PetApi;
};

export const Pet = model('Pet', PetSchema);
