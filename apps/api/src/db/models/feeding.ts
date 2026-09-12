import { FeedingSchema, type Feeding } from '@petplate/shared';
import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';
import { idOf, isoRequired } from './helpers';

export type FeedingFields = {
  petId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  fedAt: Date;
  dayKey: string;
  grams: number;
  kcal: number;
  source: 'tap' | 'voice';
  createdAt: Date;
  updatedAt: Date;
};

export type FeedingDoc = HydratedDocument<FeedingFields> & {
  toApi(): Feeding;
};

const feedingSchema = new Schema<FeedingFields>(
  {
    petId: { type: Schema.Types.ObjectId, ref: 'Pet', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    fedAt: { type: Date, required: true },
    dayKey: { type: String, required: true },
    grams: { type: Number, required: true },
    kcal: { type: Number, required: true },
    source: { type: String, enum: ['tap', 'voice'], required: true },
  },
  { timestamps: true },
);

feedingSchema.index({ petId: 1, dayKey: 1 });

feedingSchema.methods.toApi = function toApi(this: FeedingDoc): Feeding {
  return FeedingSchema.parse({
    id: idOf(this._id),
    petId: idOf(this.petId),
    fedAt: isoRequired(this.fedAt),
    dayKey: this.dayKey,
    grams: this.grams,
    kcal: this.kcal,
    source: this.source,
  });
};

export const FeedingModel: Model<FeedingFields> =
  mongoose.models.Feeding ?? mongoose.model<FeedingFields>('Feeding', feedingSchema);
