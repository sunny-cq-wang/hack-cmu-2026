import { WeighInSchema, type WeighIn } from '@petplate/shared';
import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';
import { idOf, isoRequired } from './helpers';

export type WeighInFields = {
  subjectType: 'user' | 'pet';
  subjectId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  weighedAt: Date;
  weightKg: number;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type WeighInDoc = HydratedDocument<WeighInFields> & {
  toApi(): WeighIn;
};

const weighInSchema = new Schema<WeighInFields>(
  {
    subjectType: { type: String, enum: ['user', 'pet'], required: true },
    subjectId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    weighedAt: { type: Date, required: true },
    weightKg: { type: Number, required: true },
    note: { type: String, default: null },
  },
  { timestamps: true },
);

weighInSchema.index({ subjectType: 1, subjectId: 1, weighedAt: -1 });

weighInSchema.methods.toApi = function toApi(this: WeighInDoc): WeighIn {
  return WeighInSchema.parse({
    id: idOf(this._id),
    subjectType: this.subjectType,
    subjectId: idOf(this.subjectId),
    weightKg: this.weightKg,
    weighedAt: isoRequired(this.weighedAt),
    note: this.note ?? null,
  });
};

export const WeighInModel: Model<WeighInFields> =
  mongoose.models.WeighIn ?? mongoose.model<WeighInFields>('WeighIn', weighInSchema);

/** Short name the P3/P4 routes and services import. */
export { WeighInModel as WeighIn };
