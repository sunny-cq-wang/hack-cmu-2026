import { MealPlanSchema, type MealPlan } from '@petplate/shared';
import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';
import { idOf } from './helpers';

export type MealPlanFields = Omit<MealPlan, 'id'> & {
  userId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type MealPlanDoc = HydratedDocument<MealPlanFields> & {
  toApi(): MealPlan;
};

const mealPlanSchema = new Schema<MealPlanFields>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    forDayKey: { type: String, required: true },
    gaps: { type: Schema.Types.Mixed, default: [] },
    meals: { type: Schema.Types.Mixed, required: true },
    dayTotals: { type: Schema.Types.Mixed, required: true },
    verified: { type: Boolean, default: false },
    attempts: { type: Number, default: 1 },
    // Part of the cache key: a plan asked for with different instructions is a different plan.
    customInstructions: { type: String, default: null },
  },
  { timestamps: true },
);

mealPlanSchema.index({ userId: 1, forDayKey: 1 });

mealPlanSchema.methods.toApi = function toApi(this: MealPlanDoc): MealPlan {
  return MealPlanSchema.parse({
    id: idOf(this._id),
    forDayKey: this.forDayKey,
    gaps: this.gaps,
    meals: this.meals,
    dayTotals: this.dayTotals,
    verified: this.verified,
    attempts: this.attempts,
    customInstructions: this.customInstructions ?? null,
  });
};

export const MealPlanModel: Model<MealPlanFields> =
  mongoose.models.MealPlan ?? mongoose.model<MealPlanFields>('MealPlan', mealPlanSchema);
