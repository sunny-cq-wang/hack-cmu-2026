import { NutrientsSchema, type Nutrients } from '@petplate/shared';
import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';
import { idOf } from './helpers';

export type FoodFields = {
  queryKey: string;
  fdcId: number;
  description: string;
  per100g: Nutrients;
  dataType: string;
  createdAt: Date;
  updatedAt: Date;
};

export type FoodApi = {
  id: string;
  queryKey: string;
  fdcId: number;
  description: string;
  per100g: Nutrients;
  dataType: string;
};

export type FoodDoc = HydratedDocument<FoodFields> & {
  toApi(): FoodApi;
};

const foodSchema = new Schema<FoodFields>(
  {
    queryKey: { type: String, required: true, unique: true, index: true },
    fdcId: { type: Number, required: true },
    description: { type: String, required: true },
    per100g: { type: Schema.Types.Mixed, required: true },
    dataType: { type: String, required: true },
  },
  { timestamps: true },
);

foodSchema.methods.toApi = function toApi(this: FoodDoc): FoodApi {
  return {
    id: idOf(this._id),
    queryKey: this.queryKey,
    fdcId: this.fdcId,
    description: this.description,
    per100g: NutrientsSchema.parse(this.per100g),
    dataType: this.dataType,
  };
};

export const FoodModel: Model<FoodFields> =
  mongoose.models.Food ?? mongoose.model<FoodFields>('Food', foodSchema);
