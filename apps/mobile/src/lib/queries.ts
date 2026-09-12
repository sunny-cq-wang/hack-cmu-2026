/**
 * react-query hooks. TODO(P1): owns this file — P4 consumes `useToday()` and
 * `useCreateMeal()` exactly as specified in P1 task file §5.
 */
import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { MealCreateSchema, TodaySummarySchema, z, type MealCreate, type TodaySummary } from './shared';
import { api } from './api';

export const TODAY_KEY = ['today'] as const;

export function useToday(): UseQueryResult<TodaySummary, Error> {
  return useQuery({
    queryKey: TODAY_KEY,
    queryFn: () => api('/me/today', { schema: TodaySummarySchema }),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

const CreateMealResponseSchema = z.object({
  today: TodaySummarySchema,
});

export function useCreateMeal(): UseMutationResult<z.output<typeof CreateMealResponseSchema>, Error, MealCreate> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: MealCreate) =>
      api('/meals', {
        method: 'POST',
        body: JSON.stringify(MealCreateSchema.parse(input)),
        schema: CreateMealResponseSchema,
      }),
    onSuccess: (res) => {
      // Home's avatar animates because ['today'] was replaced (P1 §5).
      queryClient.setQueryData(TODAY_KEY, res.today);
      void queryClient.invalidateQueries({ queryKey: ['meals'] });
    },
  });
}

/** Lets a voice turn push its fresh `today` into the same cache entry. */
export function useSetToday(): (today: TodaySummary) => void {
  const queryClient = useQueryClient();
  return (today: TodaySummary) => queryClient.setQueryData(TODAY_KEY, today);
}
