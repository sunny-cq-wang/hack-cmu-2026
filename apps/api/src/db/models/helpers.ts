import { Types } from 'mongoose';

export function idOf(value: Types.ObjectId | string): string {
  return typeof value === 'string' ? value : value.toString();
}

export function photoUrl(id: Types.ObjectId | string | null | undefined): string | null {
  if (!id) return null;
  return `/api/photos/${id.toString()}`;
}

export function iso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  return d instanceof Date ? d.toISOString() : d;
}

export function isoRequired(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : d;
}
