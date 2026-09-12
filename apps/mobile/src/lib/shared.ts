/**
 * Re-export of @petplate/shared plus zod.
 *
 * Metro resolves the workspace package through its compiled `dist`, so keeping
 * the import in one module means a single place to fix if resolution changes.
 */
export { z } from 'zod';
export {
  ApiErrorSchema,
  AvatarInfoSchema,
  AvatarStatusSchema,
  AvatarStateSchema,
  MealCreateSchema,
  TodaySummarySchema,
  VoiceTurnResponseSchema,
} from '@petplate/shared';
export type {
  AvatarInfo,
  AvatarState,
  AvatarStatus,
  MealCreate,
  TodaySummary,
  VoiceTurnResponse,
} from '@petplate/shared';
