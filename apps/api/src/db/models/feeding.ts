import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import type { Feeding as FeedingApi } from '@petplate/shared';

// TODO(P2): replace — exact signature: Mongoose Feeding model per DATA_MODEL §4; index { petId: 1, dayKey: 1 }; toApi() maps _id → id.

const FeedingSchema = new Schema(
  {
    petId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    fedAt: { type: Date, required: true },
    dayKey: { type: String, required: true },
    grams: { type: Number, required: true },
    kcal: { type: Number, required: true },
    source: { type: String, enum: ['tap', 'voice'], required: true, default: 'tap' },
  },
  { timestamps: true },
);

FeedingSchema.index({ petId: 1, dayKey: 1 });

FeedingSchema.methods.toApi = function toApi(): FeedingApi {
  return {
    id: String(this._id),
    petId: String(this.petId),
    fedAt: this.fedAt.toISOString(),
    dayKey: this.dayKey,
    grams: this.grams,
    kcal: this.kcal,
    source: this.source,
  };
};

export type FeedingDoc = InferSchemaType<typeof FeedingSchema> & {
  _id: Types.ObjectId;
  toApi: () => FeedingApi;
};

export const Feeding = model('Feeding', FeedingSchema);
