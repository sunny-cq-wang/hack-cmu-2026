import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  FeedingSchema,
  PetSchema,
  TodaySummarySchema,
  WeighInResponseSchema,
  WeighInSchema,
  TrendSchema,
  UserSchema,
  type Pet,
  type TodaySummary,
} from '@petplate/shared';
import { api } from './api';

const PetResponse = z.object({ pet: PetSchema });
const FeedResponse = z.object({ feeding: FeedingSchema, today: TodaySummarySchema });
const WeighInsResponse = z.object({
  weighIns: z.array(WeighInSchema),
  trend: TrendSchema,
});

const UserResponse = z.object({ user: UserSchema });

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () =>
      api('/me/bootstrap', {
        method: 'POST',
        body: JSON.stringify({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, name: 'Demo' }),
        schema: UserResponse,
      }),
    staleTime: Infinity,
  });
}

export function useToday() {
  return useQuery({
    queryKey: ['today'],
    queryFn: () => api('/me/today', { schema: TodaySummarySchema }),
    staleTime: 0,
  });
}

export function usePet() {
  const today = useToday();
  const petId = today.data?.pet?.petId;
  return useQuery({
    queryKey: ['pet', petId],
    enabled: Boolean(petId),
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
    },
  });
}

export function useWeighIns(subject: 'pet' | 'user') {
  const today = useToday();
  const me = useMe();
  const subjectId = subject === 'pet' ? today.data?.pet?.petId : me.data?.user.id;
  return useQuery({
    queryKey: ['weighins', subject, subjectId],
    enabled: Boolean(subjectId),
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
    onSuccess: async () => {
      const today = await api('/me/today', { schema: TodaySummarySchema });
      qc.setQueryData(['today'], today);
      await qc.invalidateQueries({ queryKey: ['weighins'] });
      await qc.invalidateQueries({ queryKey: ['pet'] });
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
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['pet'] });
      await qc.invalidateQueries({ queryKey: ['today'] });
    },
  });
}

export type { TodaySummary, Pet };
