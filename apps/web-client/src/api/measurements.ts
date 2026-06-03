import {
  createMeasurementRequestSchema,
  updateMeasurementRequestSchema,
  measurementResponseSchema,
  measurementListResponseSchema,
  type MeasurementResponse,
  type CreateMeasurementRequest,
  type UpdateMeasurementRequest,
} from '@trener/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch, ApiError } from './client';

const measurementWrap = z.object({ measurement: measurementResponseSchema });
const okWrap = z.object({ ok: z.boolean() });

export const clientMeasurementsQueryKey = ['client', 'measurements'] as const;

/** Замеры клиента. Непривязанный (409) → пустой список, не ошибка. */
export function useClientMeasurements() {
  return useQuery<MeasurementResponse[]>({
    queryKey: clientMeasurementsQueryKey,
    queryFn: async () => {
      try {
        const r = await apiFetch('/client/measurements', {
          schema: measurementListResponseSchema,
        });
        return r.measurements;
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) return [];
        throw err;
      }
    },
  });
}

export function useCreateMeasurement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMeasurementRequest) =>
      apiFetch('/client/measurements', {
        method: 'POST',
        body: createMeasurementRequestSchema.parse(input),
        schema: measurementWrap,
      }).then((r) => r.measurement),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientMeasurementsQueryKey });
    },
  });
}

export interface UpdateMeasurementArgs {
  mid: string;
  input: UpdateMeasurementRequest;
}

export function useUpdateMeasurement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ mid, input }: UpdateMeasurementArgs) =>
      apiFetch(`/client/measurements/${mid}`, {
        method: 'PATCH',
        body: updateMeasurementRequestSchema.parse(input),
        schema: measurementWrap,
      }).then((r) => r.measurement),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientMeasurementsQueryKey });
    },
  });
}

export function useDeleteMeasurement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mid: string) =>
      apiFetch(`/client/measurements/${mid}`, { method: 'DELETE', schema: okWrap }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientMeasurementsQueryKey });
    },
  });
}
