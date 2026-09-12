import { DailyScoreSchema, type DailyScore } from '@petplate/shared';
import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export type DailyScoreFields = DailyScore & {
  userId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type DailyScoreDoc = HydratedDocument<DailyScoreFields> & {
  toApi(): DailyScore;
};

const dailyScoreSchema = new Schema<DailyScoreFields>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    dayKey: { type: String, required: true },
    human: {
      consumedKcal: { type: Number, default: 0 },
      targetKcal: { type: Number, default: 0 },
      proteinG: { type: Number, default: 0 },
      score: { type: Number, default: 0 },
    },
    pet: {
      fedGrams: { type: Number, default: 0 },
      targetGrams: { type: Number, default: 0 },
      fedKcal: { type: Number, default: 0 },
      targetKcal: { type: Number, default: 0 },
      score: { type: Number, default: 0 },
    },
    combined: { type: Number, default: 0 },
    avatarState: { type: String, enum: ['thriving', 'okay', 'drooping'], default: 'drooping' },
    mood: { type: String, enum: ['thriving', 'okay', 'drooping'], default: 'okay' },
    streakCounted: { type: Boolean, default: false },
    streakLength: { type: Number, default: 0 },
    finalized: { type: Boolean, default: false },
  },
  { timestamps: true },
);

dailyScoreSchema.index({ userId: 1, dayKey: 1 }, { unique: true });

dailyScoreSchema.methods.toApi = function toApi(this: DailyScoreDoc): DailyScore {
  return DailyScoreSchema.parse({
    dayKey: this.dayKey,
    human: this.human,
    pet: this.pet,
    combined: this.combined,
    avatarState: this.avatarState,
    mood: this.mood,
    streakCounted: this.streakCounted,
    streakLength: this.streakLength,
    finalized: this.finalized,
  });
};

export const DailyScoreModel: Model<DailyScoreFields> =
  mongoose.models.DailyScore ?? mongoose.model<DailyScoreFields>('DailyScore', dailyScoreSchema);
