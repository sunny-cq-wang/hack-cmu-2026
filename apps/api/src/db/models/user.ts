import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import type { User as UserApi } from '@petplate/shared';

// TODO(P2): replace — exact signature: Mongoose User model per DATA_MODEL §1 with timestamps, unique auth0Sub, and toApi() mapping _id → id, Date → ISO.

const AdjustmentLogSchema = new Schema(
  {
    subject: { type: String, enum: ['user', 'pet'], required: true },
    message: { type: String, required: true },
    at: { type: Date, required: true },
  },
  { _id: false },
);

const UserSchema = new Schema(
  {
    auth0Sub: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, default: '' },
    name: { type: String, required: true, default: '' },
    timezone: { type: String, required: true, default: 'America/New_York' },
    profile: { type: Schema.Types.Mixed, default: null },
    targets: { type: Schema.Types.Mixed, default: null },
    petId: { type: Schema.Types.ObjectId, default: null, ref: 'Pet' },
    onboardingComplete: { type: Boolean, required: true, default: false },
  },
  { timestamps: true },
);

function iso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  return typeof d === 'string' ? d : d.toISOString();
}

UserSchema.methods.toApi = function toApi(): UserApi {
  const targets = this.targets
    ? {
        ...this.targets,
        computedAt: iso(this.targets.computedAt) ?? new Date().toISOString(),
        lastAdjustedAt: iso(this.targets.lastAdjustedAt),
      }
    : null;
  return {
    id: String(this._id),
    email: this.email,
    name: this.name,
    timezone: this.timezone,
    onboardingComplete: this.onboardingComplete,
    petId: this.petId ? String(this.petId) : null,
    profile: this.profile ?? null,
    targets,
  };
};

export type UserDoc = InferSchemaType<typeof UserSchema> & {
  _id: Types.ObjectId;
  toApi: () => UserApi;
};

export const User = model('User', UserSchema);
