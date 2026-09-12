import { PetSchema, type Pet, type PetInput, type PetTargets } from '@petplate/shared';
import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';
import { idOf, iso, photoUrl } from './helpers';
import type { AdjustmentLogEntry } from './user';

export type StoredPetTargets = Omit<PetTargets, 'computedAt' | 'lastAdjustedAt'> & {
  computedAt: Date;
  lastAdjustedAt: Date | null;
  adjustmentLog?: AdjustmentLogEntry[];
};

export type PetAvatarStored = {
  status: 'none' | 'generating' | 'ready' | 'failed';
  sourcePhotoId: mongoose.Types.ObjectId | null;
  neutralPhotoId: mongoose.Types.ObjectId | null;
  thrivingPhotoId: mongoose.Types.ObjectId | null;
  droopingPhotoId: mongoose.Types.ObjectId | null;
  celebrationVideoUrl: string | null;
  stylePrompt: string;
  voice: string;
  imagineJobs: { kind: string; requestId: string; status: string }[];
};

export type PetFields = Omit<PetInput, 'food'> & {
  userId: mongoose.Types.ObjectId;
  goal: 'lose' | 'maintain';
  food: { name: string; kcalPerCup: number; gramsPerCup: number };
  targets: StoredPetTargets;
  avatar: PetAvatarStored;
  createdAt: Date;
  updatedAt: Date;
};

export type PetDoc = HydratedDocument<PetFields> & {
  toApi(): Pet;
};

const adjustmentLogSchema = new Schema(
  {
    subject: { type: String, enum: ['user', 'pet'], required: true },
    message: { type: String, required: true },
    at: { type: Date, required: true },
  },
  { _id: false },
);

const petTargetsSchema = new Schema(
  {
    rerKcal: Number,
    merFactor: Number,
    baseKcal: Number,
    adaptivePct: { type: Number, default: 0 },
    kcal: Number,
    portionGramsPerDay: Number,
    mealsPerDay: { type: Number, default: 2 },
    computedAt: Date,
    lastAdjustedAt: { type: Date, default: null },
    adjustmentLog: { type: [adjustmentLogSchema], default: [] },
  },
  { _id: false, strict: false },
);

const petSchema = new Schema<PetFields>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true },
    species: { type: String, enum: ['dog', 'cat', 'virtual'], required: true },
    breed: { type: String, default: null },
    avatarDescription: { type: String, default: null },
    sex: { type: String, enum: ['male', 'female', null], default: null },
    neutered: { type: Boolean, default: true },
    ageYears: { type: Number, default: null },
    weightKg: { type: Number, required: true },
    idealWeightKg: { type: Number, required: true },
    activity: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' },
    mealsPerDay: { type: Number, default: 2 },
    goal: { type: String, enum: ['lose', 'maintain'], required: true },
    food: {
      name: { type: String, default: 'Dry food' },
      kcalPerCup: { type: Number, default: 375 },
      gramsPerCup: { type: Number, default: 110 },
    },
    targets: { type: petTargetsSchema, required: true },
    avatar: {
      status: { type: String, enum: ['none', 'generating', 'ready', 'failed'], default: 'none' },
      sourcePhotoId: { type: Schema.Types.ObjectId, default: null },
      neutralPhotoId: { type: Schema.Types.ObjectId, default: null },
      thrivingPhotoId: { type: Schema.Types.ObjectId, default: null },
      droopingPhotoId: { type: Schema.Types.ObjectId, default: null },
      celebrationVideoUrl: { type: String, default: null },
      stylePrompt: { type: String, default: '' },
      voice: { type: String, default: 'Ara' },
      imagineJobs: { type: Schema.Types.Mixed, default: [] },
    },
  },
  { timestamps: true },
);

petSchema.methods.toApi = function toApi(this: PetDoc): Pet {
  return PetSchema.parse({
    id: idOf(this._id),
    userId: idOf(this.userId),
    name: this.name,
    species: this.species,
    breed: this.breed ?? null,
    avatarDescription: this.avatarDescription ?? null,
    sex: this.sex ?? null,
    neutered: this.neutered,
    ageYears: this.ageYears ?? null,
    weightKg: this.weightKg,
    idealWeightKg: this.idealWeightKg,
    activity: this.activity,
    mealsPerDay: this.mealsPerDay,
    food: this.food,
    goal: this.goal,
    targets: {
      rerKcal: this.targets.rerKcal,
      merFactor: this.targets.merFactor,
      baseKcal: this.targets.baseKcal,
      adaptivePct: this.targets.adaptivePct,
      kcal: this.targets.kcal,
      portionGramsPerDay: this.targets.portionGramsPerDay,
      mealsPerDay: this.targets.mealsPerDay,
      computedAt: iso(this.targets.computedAt) ?? new Date().toISOString(),
      lastAdjustedAt: iso(this.targets.lastAdjustedAt),
    },
    avatar: {
      status: this.avatar.status,
      neutralUrl: photoUrl(this.avatar.neutralPhotoId),
      thrivingUrl: photoUrl(this.avatar.thrivingPhotoId),
      droopingUrl: photoUrl(this.avatar.droopingPhotoId),
      celebrationVideoUrl: this.avatar.celebrationVideoUrl ?? null,
      voice: this.avatar.voice ?? 'Ara',
    },
  });
};

export const PetModel: Model<PetFields> =
  mongoose.models.Pet ?? mongoose.model<PetFields>('Pet', petSchema);

/** Short name the P3/P4 routes and services import. */
export { PetModel as Pet };
