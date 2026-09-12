import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';
import { idOf } from './helpers';

export type PhotoKind = 'meal' | 'pet_source' | 'avatar';

export type PhotoFields = {
  userId: mongoose.Types.ObjectId;
  kind: PhotoKind;
  contentType: string;
  data: Buffer;
  width: number;
  height: number;
  createdAt: Date;
  updatedAt: Date;
};

export type PhotoMeta = {
  id: string;
  userId: string;
  kind: PhotoKind;
  contentType: string;
  width: number;
  height: number;
};

export type PhotoDoc = HydratedDocument<PhotoFields> & {
  toApi(): PhotoMeta;
};

const photoSchema = new Schema<PhotoFields>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: ['meal', 'pet_source', 'avatar'], required: true },
    contentType: { type: String, required: true },
    data: { type: Buffer, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
  },
  { timestamps: true },
);

photoSchema.methods.toApi = function toApi(this: PhotoDoc): PhotoMeta {
  return {
    id: idOf(this._id),
    userId: idOf(this.userId),
    kind: this.kind,
    contentType: this.contentType,
    width: this.width,
    height: this.height,
  };
};

export const PhotoModel: Model<PhotoFields> =
  mongoose.models.Photo ?? mongoose.model<PhotoFields>('Photo', photoSchema);
