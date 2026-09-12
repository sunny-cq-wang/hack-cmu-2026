import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  FeedingSchema,
  PetSchema,
  TodaySummarySchema,
  WeighInResponseSchema,
  WeighInSchema,
  TrendSchema,
  type Pet,
  type TodaySummary,
} from '@petplate/shared';
import { api } from '../../lib/api';
import { FeedingsResponseSchema, NoContentSchema } from '../../lib/contracts';
// The canonical hooks own the ['me'] and ['today'] cache entries. Redefining them
// here gave the same keys two different payload shapes, and whichever hook filled
// the cache first decided which readers crashed. Re-export so callers keep their
// `./queries` import.
import { useMe, useToday } from '../../lib/queries';

export { useMe, useToday };

const PetResponse = z.object({ pet: PetSchema });
const FeedResponse = z.object({ feeding: FeedingSchema, today: TodaySummarySchema });
const WeighInsResponse = z.object({
  weighIns: z.array(WeighInSchema),
  trend: TrendSchema,
});

export function usePet() {
  const today = useToday();
  const petId = today.data?.pet?.petId;
  return useQuery({
    queryKey: ['pet', petId],
    enabled: Boolean(petId),
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: () => api(`/pets/${petId}`, { schema: PetResponse }).then((r) => r.pet),
  });
}

export function useFeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { petId: string; grams?: number }) =>
      api(`/pets/${args.petId}/feedings`, {
        method: 'POST',
        body: JSON.stringify({ grams: args.grams, source: 'tap' }),
        schema: FeedResponse,
      }),
    onSuccess: (res) => {
      qc.setQueryData(['today'], res.today);
      void qc.invalidateQueries({ queryKey: ['feedings'] });
    },
  });
}

export function useFeedings() {
  const today = useToday();
  const petId = today.data?.pet?.petId;
  const dayKey = today.data?.dayKey;
  return useQuery({
    queryKey: ['feedings', petId, dayKey],
    enabled: Boolean(petId && dayKey),
    queryFn: () =>
      api(`/pets/${petId}/feedings${dayKey ? `?date=${dayKey}` : ''}`, { schema: FeedingsResponseSchema }).then(
        (r) => r.feedings,
      ),
  });
}

export function useDeleteFeeding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { petId: string; feedingId: string }) =>
      api(`/pets/${args.petId}/feedings/${args.feedingId}`, { method: 'DELETE', schema: NoContentSchema }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['today'] }),
        qc.invalidateQueries({ queryKey: ['feedings'] }),
      ]);
    },
  });
}

export function useWeighIns(subject: 'pet' | 'user') {
  const today = useToday();
  const me = useMe();
  // Human rows are keyed to the signed-in user on the server. `self` is enough
  // for the query string when `/me` has not landed yet.
  const subjectId = subject === 'pet' ? today.data?.pet?.petId : (me.data?.id ?? 'self');
  return useQuery({
    queryKey: subject === 'user' ? ['weighins', 'user'] : ['weighins', 'pet', subjectId],
    enabled: subject === 'user' || Boolean(subjectId),
    queryFn: () => api(`/weighins?subjectType=${subject}&subjectId=${subjectId}&limit=30`, { schema: WeighInsResponse }),
  });
}

export function useCreateWeighIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { subjectType: 'pet' | 'user'; subjectId: string; weightKg: number }) =>
      api('/weighins', {
        method: 'POST',
        body: JSON.stringify(body),
        schema: WeighInResponseSchema,
      }),
    onSuccess: async (res, vars) => {
      const today = await api('/me/today', { schema: TodaySummarySchema });
      qc.setQueryData(['today'], today);
      const weighKey = vars.subjectType === 'user' ? ['weighins', 'user'] : ['weighins', 'pet', vars.subjectId];
      qc.setQueryData(weighKey, (prev: unknown) => {
        const prior = prev as { weighIns: unknown[]; trend: unknown } | undefined;
        return {
          weighIns: [res.weighIn, ...(prior?.weighIns ?? [])],
          trend: res.trend,
        };
      });
      await qc.invalidateQueries({ queryKey: ['weighins'] });
      await qc.invalidateQueries({ queryKey: ['pet'] });
      await qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
}

export function useSavePet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { existing?: Pet; body: unknown }) => {
      const path = args.existing ? `/pets/${args.existing.id}` : '/pets';
      return api(path, {
        method: args.existing ? 'PUT' : 'POST',
        body: JSON.stringify(args.body),
        schema: PetResponse,
      });
    },
    onSuccess: async (res) => {
      qc.setQueryData(['pet', res.pet.id], res.pet);
      await qc.invalidateQueries({ queryKey: ['pet'] });
      await qc.invalidateQueries({ queryKey: ['today'] });
      // Saving the pet is what completes onboarding on a first run, so `['me']` —
      // which `app/index.tsx` reads `onboardingComplete` from to choose between Home
      // and /onboarding/profile — is stale from this moment unless it is refetched.
      await qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
}

export type { TodaySummary, Pet };
