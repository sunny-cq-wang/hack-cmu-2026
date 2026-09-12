/**
 * Record shapes shared by both store backends. Mirrors DATA_MODEL.md.
 * TODO(P2): these live here only so P4 can run; fold into P2's models when Atlas lands.
 */
import type { AvatarInfo, PetInput, PetTargets } from '@petplate/shared';

export type PhotoKind = 'meal' | 'pet_source' | 'avatar';

export interface PhotoRecord {
  id: string;
  userId: string;
  kind: PhotoKind;
  contentType: string;
  width: number;
  height: number;
  bytes: number;
  createdAt: string;
}

export type ImagineJobKind = 'neutral' | 'thriving' | 'drooping' | 'video';

export interface ImagineJob {
  kind: ImagineJobKind;
  requestId: string;
  status: 'pending' | 'done' | 'failed';
}

export interface PetAvatarRecord {
  status: AvatarInfo['status'];
  sourcePhotoId: string | null;
  neutralPhotoId: string | null;
  thrivingPhotoId: string | null;
  droopingPhotoId: string | null;
  celebrationVideoUrl: string | null;
  stylePrompt: string;
  voice: string;
  imagineJobs: ImagineJob[];
}

export interface PetRecord extends PetInput {
  id: string;
  userId: string;
  goal: 'lose' | 'maintain';
  targets: PetTargets;
  avatar: PetAvatarRecord;
}

export interface UserRecord {
  id: string;
  auth0Sub: string;
  email: string;
  name: string;
  timezone: string;
  onboardingComplete: boolean;
  petId: string | null;
}

export interface FeedingRecord {
  id: string;
  petId: string;
  userId: string;
  fedAt: string;
  dayKey: string;
  grams: number;
  kcal: number;
  source: 'tap' | 'voice';
}

export interface MealRecord {
  id: string;
  userId: string;
  loggedAt: string;
  dayKey: string;
  kcal: number;
  proteinG: number;
}

export const emptyPetAvatar = (voice: string): PetAvatarRecord => ({
  status: 'none',
  sourcePhotoId: null,
  neutralPhotoId: null,
  thrivingPhotoId: null,
  droopingPhotoId: null,
  celebrationVideoUrl: null,
  stylePrompt: '',
  voice,
  imagineJobs: [],
});
