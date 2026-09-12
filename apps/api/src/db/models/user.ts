import {
  HumanProfileSchema,
  HumanTargetsSchema,
  UserSchema,
  type HumanProfile,
  type HumanTargets,
  type User,
} from '@petplate/shared';
import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';
import { idOf, iso } from './helpers';

export type AdjustmentLogEntry = {
  subject: 'user' | 'pet';
  message: string;
  at: Date;
};

export type StoredHumanTargets = Omit<HumanTargets, 'computedAt' | 'lastAdjustedAt'> & {
  computedAt: Date;
  lastAdjustedAt: Date | null;
  adjustmentLog?: AdjustmentLogEntry[];
};

export type UserFields = {
  auth0Sub: string;
  email: string;
  name: string;
  timezone: string;
  profile: HumanProfile | null;
  targets: StoredHumanTargets | null;
  petId: mongoose.Types.ObjectId | null;
  onboardingComplete: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type UserDoc = HydratedDocument<UserFields> & {
  toApi(): User;
};

const adjustmentLogSchema = new Schema(
  {
    subject: { type: String, enum: ['user', 'pet'], required: true },
    message: { type: String, required: true },
    at: { type: Date, required: true },
  },
  { _id: false },
);

const humanTargetsSchema = new Schema(
  {
    kcal: Number,
    baseKcal: Number,
    adaptiveOffsetKcal: { type: Number, default: 0 },
    proteinG: Number,
    carbsG: Number,
    fatG: Number,
    micros: { type: Schema.Types.Mixed, default: {} },
    computedAt: Date,
    lastAdjustedAt: { type: Date, default: null },
    adjustmentLog: { type: [adjustmentLogSchema], default: [] },
  },
  { _id: false, strict: false },
);

const userSchema = new Schema<UserFields>(
  {
    auth0Sub: { type: String, required: true, unique: true, index: true },
    email: { type: String, default: '' },
    name: { type: String, default: '' },
    timezone: { type: String, default: 'America/New_York' },
    profile: { type: Schema.Types.Mixed, default: null },
    targets: { type: humanTargetsSchema, default: null },
    petId: { type: Schema.Types.ObjectId, ref: 'Pet', default: null },
    onboardingComplete: { type: Boolean, default: false },
  },
  { timestamps: true },
);

userSchema.methods.toApi = function toApi(this: UserDoc): User {
  const targets = this.targets
    ? HumanTargetsSchema.parse({
        kcal: this.targets.kcal,
        baseKcal: this.targets.baseKcal,
        adaptiveOffsetKcal: this.targets.adaptiveOffsetKcal,
        proteinG: this.targets.proteinG,
        carbsG: this.targets.carbsG,
        fatG: this.targets.fatG,
        micros: this.targets.micros ?? {},
        computedAt: iso(this.targets.computedAt) ?? new Date().toISOString(),
        lastAdjustedAt: iso(this.targets.lastAdjustedAt),
      })
    : null;
  return UserSchema.parse({
    id: idOf(this._id),
    email: this.email,
    name: this.name,
    timezone: this.timezone,
    onboardingComplete: this.onboardingComplete,
    petId: this.petId ? idOf(this.petId) : null,
    profile: this.profile ? HumanProfileSchema.parse(this.profile) : null,
    targets,
  });
};

export const UserModel: Model<UserFields> =
  mongoose.models.User ?? mongoose.model<UserFields>('User', userSchema);

/** Short name the P3/P4 routes and services import. */
export { UserModel as User };
