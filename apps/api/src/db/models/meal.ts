import { MealSchema, NutrientsSchema, type Meal, type MealItem, type Nutrients } from '@petplate/shared';
import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';
import { idOf, isoRequired, photoUrl } from './helpers';

export type MealFields = {
  userId: mongoose.Types.ObjectId;
  loggedAt: Date;
  dayKey: string;
  slot: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  photoId: mongoose.Types.ObjectId | null;
  source: 'photo' | 'manual' | 'voice' | 'plan';
  items: MealItem[];
  totals: Nutrients;
  analysis: { model: string; latencyMs: number; raw: unknown } | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MealDoc = HydratedDocument<MealFields> & {
  toApi(): Meal;
};

const mealSchema = new Schema<MealFields>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    loggedAt: { type: Date, required: true },
    dayKey: { type: String, required: true, index: true },
    slot: { type: String, enum: ['breakfast', 'lunch', 'dinner', 'snack'], required: true },
    photoId: { type: Schema.Types.ObjectId, ref: 'Photo', default: null },
    source: { type: String, enum: ['photo', 'manual', 'voice', 'plan'], required: true },
    items: { type: Schema.Types.Mixed, required: true },
    totals: { type: Schema.Types.Mixed, required: true },
    analysis: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

mealSchema.index({ userId: 1, loggedAt: 1 });
mealSchema.index({ userId: 1, dayKey: 1 });

mealSchema.methods.toApi = function toApi(this: MealDoc): Meal {
  return MealSchema.parse({
    id: idOf(this._id),
    loggedAt: isoRequired(this.loggedAt),
    dayKey: this.dayKey,
    slot: this.slot,
    photoId: this.photoId ? idOf(this.photoId) : null,
    photoUrl: photoUrl(this.photoId),
    source: this.source,
    items: this.items,
    totals: NutrientsSchema.parse(this.totals),
  });
};

export const MealModel: Model<MealFields> =
  mongoose.models.Meal ?? mongoose.model<MealFields>('Meal', mealSchema);

/** Short name the P3/P4 routes and services import. */
export { MealModel as Meal };
