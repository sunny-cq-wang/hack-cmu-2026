/**
 * Mongoose models for the collections P4 touches.
 *
 * TODO(P2): this is a stub covering only users/pets/photos/feedings/meals so the
 * avatar + voice flows can run. Replace with the full per-collection models in
 * DATA_MODEL.md (dailyScores, weighIns, mealPlans, foods) and keep the field names.
 */
import mongoose, { Schema, type Model } from 'mongoose';

const AvatarSchema = new Schema(
  {
    status: { type: String, enum: ['none', 'generating', 'ready', 'failed'], default: 'none' },
    sourcePhotoId: { type: Schema.Types.ObjectId, default: null },
    neutralPhotoId: { type: Schema.Types.ObjectId, default: null },
    thrivingPhotoId: { type: Schema.Types.ObjectId, default: null },
    droopingPhotoId: { type: Schema.Types.ObjectId, default: null },
    celebrationVideoUrl: { type: String, default: null },
    stylePrompt: { type: String, default: '' },
    voice: { type: String, default: 'eve' },
    imagineJobs: {
      type: [
        {
          _id: false,
          kind: { type: String, required: true },
          requestId: { type: String, required: true },
          status: { type: String, enum: ['pending', 'done', 'failed'], default: 'pending' },
        },
      ],
      default: [],
    },
  },
  { _id: false },
);

const UserSchemaM = new Schema(
  {
    auth0Sub: { type: String, required: true, unique: true, index: true },
    email: { type: String, default: '' },
    name: { type: String, default: '' },
    timezone: { type: String, default: 'America/New_York' },
    onboardingComplete: { type: Boolean, default: false },
    petId: { type: Schema.Types.ObjectId, default: null },
    profile: { type: Schema.Types.Mixed, default: null },
    targets: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

const PetSchemaM = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true },
    species: { type: String, enum: ['dog', 'cat', 'virtual'], required: true },
    breed: { type: String, default: null },
    sex: { type: String, default: null },
    neutered: { type: Boolean, default: true },
    ageYears: { type: Number, default: null },
    weightKg: { type: Number, required: true },
    idealWeightKg: { type: Number, required: true },
    activity: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' },
    food: { type: Schema.Types.Mixed, default: {} },
    mealsPerDay: { type: Number, default: 2 },
    goal: { type: String, enum: ['lose', 'maintain'], default: 'maintain' },
    targets: { type: Schema.Types.Mixed, default: {} },
    avatar: { type: AvatarSchema, default: () => ({}) },
  },
  { timestamps: true },
);

const PhotoSchemaM = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    kind: { type: String, enum: ['meal', 'pet_source', 'avatar'], required: true },
    contentType: { type: String, default: 'image/jpeg' },
    data: { type: Buffer, required: true },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const FeedingSchemaM = new Schema(
  {
    petId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    fedAt: { type: Date, required: true },
    dayKey: { type: String, required: true },
    grams: { type: Number, required: true },
    kcal: { type: Number, required: true },
    source: { type: String, enum: ['tap', 'voice'], default: 'tap' },
  },
  { timestamps: true },
);
FeedingSchemaM.index({ petId: 1, dayKey: 1 });

const MealSchemaM = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    loggedAt: { type: Date, required: true },
    dayKey: { type: String, required: true, index: true },
    slot: { type: String, default: 'snack' },
    photoId: { type: Schema.Types.ObjectId, default: null },
    source: { type: String, default: 'photo' },
    items: { type: [Schema.Types.Mixed], default: [] },
    totals: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

// `models[name] ??` keeps tsx watch-mode hot reloads from redefining models.
const model = <T>(name: string, schema: Schema): Model<T> =>
  (mongoose.models[name] as Model<T> | undefined) ?? mongoose.model<T>(name, schema);

// why: Mongoose document generics add no safety over the store facade's own types.
/* eslint-disable @typescript-eslint/no-explicit-any */
export const UserModel = model<any>('User', UserSchemaM);
export const PetModel = model<any>('Pet', PetSchemaM);
export const PhotoModel = model<any>('Photo', PhotoSchemaM);
export const FeedingModel = model<any>('Feeding', FeedingSchemaM);
export const MealModel = model<any>('Meal', MealSchemaM);
