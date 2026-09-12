import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

// TODO(P2): replace — exact signature: Mongoose Meal model per DATA_MODEL §3; index { userId: 1, loggedAt: 1 } and dayKey; toApi() maps _id → id, photoId → photoUrl.

const MealSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    loggedAt: { type: Date, required: true },
    dayKey: { type: String, required: true, index: true },
    slot: { type: String, enum: ['breakfast', 'lunch', 'dinner', 'snack'], required: true },
    photoId: { type: Schema.Types.ObjectId, default: null },
    source: { type: String, enum: ['photo', 'manual', 'voice', 'plan'], required: true },
    items: { type: [Schema.Types.Mixed], default: [] },
    totals: { type: Schema.Types.Mixed, required: true },
    analysis: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

MealSchema.index({ userId: 1, loggedAt: 1 });

export type MealDoc = InferSchemaType<typeof MealSchema> & { _id: Types.ObjectId };

export const Meal = model('Meal', MealSchema);
