/**
 * Collection models. P3 owns the per-document schemas; Photo stays here because
 * P3 did not ship one and the avatar pipeline needs it.
 */
import mongoose, { Schema, type Model } from 'mongoose';

export { User, User as UserModel } from './user.js';
export { Pet, Pet as PetModel } from './pet.js';
export { Feeding, Feeding as FeedingModel } from './feeding.js';
export { Meal, Meal as MealModel } from './meal.js';
export { WeighIn } from './weighIn.js';
export { DailyScore } from './dailyScore.js';

const PhotoSchema = new Schema(
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

const modelOf = <T>(name: string, schema: Schema): Model<T> =>
  (mongoose.models[name] as Model<T> | undefined) ?? mongoose.model<T>(name, schema);

// why: mongoose document generics add no safety over the store facade's own types.
export const PhotoModel = modelOf<any>('Photo', PhotoSchema);
