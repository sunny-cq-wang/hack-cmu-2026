import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import type { WeighIn as WeighInApi } from '@petplate/shared';

// TODO(P2): replace — exact signature: Mongoose WeighIn model per DATA_MODEL §5; index { subjectType: 1, subjectId: 1, weighedAt: -1 }; toApi() maps _id → id.

const WeighInSchema = new Schema(
  {
    subjectType: { type: String, enum: ['user', 'pet'], required: true },
    subjectId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    weighedAt: { type: Date, required: true },
    weightKg: { type: Number, required: true },
    note: { type: String, default: null },
  },
  { timestamps: true },
);

WeighInSchema.index({ subjectType: 1, subjectId: 1, weighedAt: -1 });

WeighInSchema.methods.toApi = function toApi(): WeighInApi {
  return {
    id: String(this._id),
    subjectType: this.subjectType,
    subjectId: String(this.subjectId),
    weightKg: this.weightKg,
    weighedAt: this.weighedAt.toISOString(),
    note: this.note ?? null,
  };
};

export type WeighInDoc = InferSchemaType<typeof WeighInSchema> & {
  _id: Types.ObjectId;
  toApi: () => WeighInApi;
};

export const WeighIn = model('WeighIn', WeighInSchema);
