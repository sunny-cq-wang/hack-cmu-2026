/**
 * Response *envelopes* from docs/API_CONTRACTS.md that `@petplate/shared` does not
 * ship yet (`{ "user": User }`, `{ "meals": Meal[] }`, ...).
 *
 * Every one of these is composed from a shared schema — no payload field is ever
 * re-declared here (AGENTS.md §4.2). P2: please move these into `@petplate/shared`
 * so the API and the app validate the identical object; see
 * `tasks/P1_MOBILE_CORE.md` §8.
 */
import {
  DailyScoreSchema,
  FeedingSchema,
  MealPlanSchema,
  MealSchema,
  PetSchema,
  TodaySummarySchema,
  UserSchema,
} from '@petplate/shared';
import { z } from 'zod';

/** `POST /me/bootstrap`, `PUT /me/profile` */
export const UserResponseSchema = z.object({ user: UserSchema });

/** `POST /meals` */
export const MealCreateResponseSchema = z.object({
  meal: MealSchema,
  today: TodaySummarySchema,
});

/** `GET /meals?date=YYYY-MM-DD` */
export const MealsResponseSchema = z.object({ meals: z.array(MealSchema) });

/** `POST /pets`, `GET /pets/:id`, `PUT /pets/:id` */
export const PetResponseSchema = z.object({ pet: PetSchema });

/** `POST /pets/:id/feedings` */
export const FeedingResponseSchema = z.object({
  feeding: FeedingSchema,
  today: TodaySummarySchema,
});

/** `POST /mealplans/generate` */
export const MealPlanResponseSchema = z.object({ plan: MealPlanSchema });

/** `GET /scores?from=&to=` */
export const ScoresResponseSchema = z.object({ days: z.array(DailyScoreSchema) });

/** `GET /health` (public) */
export const HealthResponseSchema = z.object({ ok: z.boolean(), demoMode: z.boolean() });

/** `DELETE /meals/:id` → 204 with no body. */
export const NoContentSchema = z.void();

export type UserResponse = z.infer<typeof UserResponseSchema>;
export type MealCreateResponse = z.infer<typeof MealCreateResponseSchema>;
export type MealsResponse = z.infer<typeof MealsResponseSchema>;
export type PetResponse = z.infer<typeof PetResponseSchema>;
export type FeedingResponse = z.infer<typeof FeedingResponseSchema>;
export type MealPlanResponse = z.infer<typeof MealPlanResponseSchema>;
export type ScoresResponse = z.infer<typeof ScoresResponseSchema>;
