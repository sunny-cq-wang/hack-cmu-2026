/**
 * Every react-query hook in the app. Staleness comes from `tasks/P1_MOBILE_CORE.md` §3.
 *
 * House rule, enforced here and nowhere else: any mutation whose response carries a
 * fresh `today` writes it straight into the `['today']` cache before invalidating, so
 * the avatar reacts without waiting for a refetch.
 */
import {
  GapsResponseSchema,
  HumanProfileSchema,
  MealCreateSchema,
  MealDraftSchema,
  PetInputSchema,
  TodaySummarySchema,
  type GapsResponse,
  type Meal,
  type MealDraft,
  type MealPlan,
  type Pet,
  type TodaySummary,
  type User,
} from '@petplate/shared';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api, LONG_TIMEOUT_MS, qs } from './api';
import { currentDisplayName, deviceTimezone, useAuth } from './auth';
import {
  MealCreateResponseSchema,
  MealPlanResponseSchema,
  MealsResponseSchema,
  NoContentSchema,
  PetResponseSchema,
  UserResponseSchema,
  type HumanProfileInput,
  type MealCreateInput,
  type PetFormInput,
} from './contracts';

export const queryKeys = {
  me: ['me'] as const,
  today: ['today'] as const,
  meals: (dayKey: string) => ['meals', dayKey] as const,
  mealsRoot: ['meals'] as const,
  gaps: (days: number) => ['gaps', days] as const,
} satisfies Record<string, unknown>;

const FIVE_MINUTES = 5 * 60 * 1000;

/**
 * The device's local `YYYY-MM-DD`. Prefer `useToday().data.dayKey` when you have it —
 * that one is computed in the user's stored timezone by the server (AGENTS.md §4.6).
 */
export function localDayKey(date = new Date()): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

// ---------- queries ----------

/** `POST /me/bootstrap` — idempotent, so it doubles as "who am I". */
export function useMe(): UseQueryResult<User, Error> {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: queryKeys.me,
    enabled: isAuthenticated,
    staleTime: Infinity,
    queryFn: async () => {
      const res = await api('/me/bootstrap', {
        method: 'POST',
        body: JSON.stringify({
          timezone: deviceTimezone(),
          name: currentDisplayName() ?? 'PetPlate user',
        }),
        schema: UserResponseSchema,
      });
      return res.user;
    },
  });
}

/** `GET /me/today` — the dashboard payload. Always refetched on focus. */
export function useToday(): UseQueryResult<TodaySummary, Error> {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: queryKeys.today,
    enabled: isAuthenticated,
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: () => api('/me/today', { schema: TodaySummarySchema }),
  });
}

/** `GET /meals?date=YYYY-MM-DD` */
export function useMeals(dayKey?: string): UseQueryResult<Meal[], Error> {
  const { isAuthenticated } = useAuth();
  const key = dayKey ?? localDayKey();
  return useQuery({
    queryKey: queryKeys.meals(key),
    enabled: isAuthenticated,
    staleTime: 0,
    queryFn: async () => {
      const res = await api(`/meals${qs({ date: key })}`, { schema: MealsResponseSchema });
      return res.meals;
    },
  });
}

/** `GET /nutrition/gaps?days=7` */
export function useGaps(days = 7): UseQueryResult<GapsResponse, Error> {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: queryKeys.gaps(days),
    enabled: isAuthenticated,
    staleTime: FIVE_MINUTES,
    queryFn: () => api(`/nutrition/gaps${qs({ days })}`, { schema: GapsResponseSchema }),
  });
}

// ---------- mutations ----------

export interface AnalyzeMealInput {
  /** Local file URI of the already-resized JPEG. */
  uri: string;
  hint?: string;
}

/** `POST /meals/analyze` (multipart). Never saves a meal — it returns a draft. */
export function useAnalyzeMeal(): UseMutationResult<MealDraft, Error, AnalyzeMealInput> {
  return useMutation({
    mutationFn: ({ uri, hint }: AnalyzeMealInput) => {
      const form = new FormData();
      // why: React Native's FormData takes a {uri,name,type} descriptor where the DOM
      // expects a Blob; there is no shared type for it.
      form.append('photo', { uri, name: 'meal.jpg', type: 'image/jpeg' } as unknown as Blob);
      if (hint) {
        form.append('hint', hint);
      }
      return api('/meals/analyze', {
        method: 'POST',
        body: form,
        multipart: true,
        schema: MealDraftSchema,
      });
    },
  });
}

/** `POST /meals` → writes the returned `today` into cache, then refreshes meal lists. */
export function useCreateMeal(): UseMutationResult<
  { meal: Meal; today: TodaySummary },
  Error,
  MealCreateInput
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MealCreateInput) =>
      api('/meals', {
        method: 'POST',
        body: JSON.stringify(MealCreateSchema.parse(input)),
        schema: MealCreateResponseSchema,
      }),
    onSuccess: async (res) => {
      queryClient.setQueryData(queryKeys.today, res.today);
      await queryClient.invalidateQueries({ queryKey: queryKeys.mealsRoot });
    },
  });
}

/** `DELETE /meals/:id` → 204, so the day has to be refetched. */
export function useDeleteMeal(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mealId: string) =>
      api(`/meals/${encodeURIComponent(mealId)}`, { method: 'DELETE', schema: NoContentSchema }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.today }),
        queryClient.invalidateQueries({ queryKey: queryKeys.mealsRoot }),
      ]);
    },
  });
}

/** `POST /mealplans/generate` — Grok + USDA, so it gets the 40 s budget. */
export function useGeneratePlan(): UseMutationResult<MealPlan, Error, { forDayKey?: string } | void> {
  return useMutation({
    mutationFn: async (input: { forDayKey?: string } | void) => {
      const res = await api('/mealplans/generate', {
        method: 'POST',
        body: JSON.stringify(input ?? {}),
        timeoutMs: LONG_TIMEOUT_MS,
        schema: MealPlanResponseSchema,
      });
      return res.plan;
    },
  });
}

/** `PUT /me/profile` — the server recomputes targets, so `['me']` and `['today']` both move. */
export function useUpdateProfile(): UseMutationResult<User, Error, HumanProfileInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (profile: HumanProfileInput) => {
      const res = await api('/me/profile', {
        method: 'PUT',
        body: JSON.stringify(HumanProfileSchema.parse(profile)),
        schema: UserResponseSchema,
      });
      return res.user;
    },
    onSuccess: async (user) => {
      queryClient.setQueryData(queryKeys.me, user);
      await queryClient.invalidateQueries({ queryKey: queryKeys.today });
    },
  });
}

/**
 * `POST /pets`. Not one of the eight hooks in the brief, but the onboarding pet step
 * needs it until P3's `PetForm` lands; P3 is welcome to keep using it.
 */
export function useCreatePet(): UseMutationResult<Pet, Error, PetFormInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: PetFormInput) => {
      const res = await api('/pets', {
        method: 'POST',
        body: JSON.stringify(PetInputSchema.parse(input)),
        schema: PetResponseSchema,
      });
      return res.pet;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.me }),
        queryClient.invalidateQueries({ queryKey: queryKeys.today }),
      ]);
    },
  });
}
