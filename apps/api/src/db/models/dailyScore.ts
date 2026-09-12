import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import type { DailyScore as DailyScoreApi } from '@petplate/shared';

// TODO(P2): replace — exact signature: Mongoose DailyScore model per DATA_MODEL §6; unique { userId, dayKey }; toApi() maps _id → id.

const DailyScoreSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    dayKey: { type: String, required: true },
    human: {
      consumedKcal: { type: Number, required: true },
      targetKcal: { type: Number, required: true },
      proteinG: { type: Number, required: true },
      score: { type: Number, required: true },
    },
    pet: {
      fedGrams: { type: Number, required: true },
      targetGrams: { type: Number, required: true },
      fedKcal: { type: Number, required: true },
      targetKcal: { type: Number, required: true },
      score: { type: Number, required: true },
    },
    combined: { type: Number, required: true },
    avatarState: { type: String, enum: ['thriving', 'okay', 'drooping'], required: true },
    mood: { type: String, enum: ['thriving', 'okay', 'drooping'], required: true },
    streakCounted: { type: Boolean, required: true },
    streakLength: { type: Number, required: true },
    finalized: { type: Boolean, required: true },
  },
  { timestamps: true },
);

DailyScoreSchema.index({ userId: 1, dayKey: 1 }, { unique: true });

DailyScoreSchema.methods.toApi = function toApi(): DailyScoreApi {
  return {
    dayKey: this.dayKey,
    human: this.human,
    pet: this.pet,
    combined: this.combined,
    avatarState: this.avatarState,
    mood: this.mood,
    streakCounted: this.streakCounted,
    streakLength: this.streakLength,
    finalized: this.finalized,
  };
};

export type DailyScoreDoc = InferSchemaType<typeof DailyScoreSchema> & {
  _id: Types.ObjectId;
  toApi: () => DailyScoreApi;
};

export const DailyScore = model('DailyScore', DailyScoreSchema);
