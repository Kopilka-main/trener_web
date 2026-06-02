import { z } from 'zod';
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
import { apiFetch } from './client';

const measurementEnvelopeSchema = z.object({ measurement: measurementResponseSchema });
const okEnvelopeSchema = z.object({ ok: z.boolean() });

export const measurementsQueryKey = (clientId: string) =>
  ['clients', clientId, 'measurements'] as const;

export function listClientMeasurements(clientId: string): Promise<MeasurementResponse[]> {
  return apiFetch(`/clients/${clientId}/measurements`, {
    schema: measurementListResponseSchema,
  }).then((r) => r.measurements);
}

export function createMeasurement(
  clientId: string,
  input: CreateMeasurementRequest,
): Promise<MeasurementResponse> {
  return apiFetch(`/clients/${clientId}/measurements`, {
    method: 'POST',
    body: createMeasurementRequestSchema.parse(input),
    schema: measurementEnvelopeSchema,
  }).then((r) => r.measurement);
}

export function updateMeasurement(
  clientId: string,
  mid: string,
  input: UpdateMeasurementRequest,
): Promise<MeasurementResponse> {
  return apiFetch(`/clients/${clientId}/measurements/${mid}`, {
    method: 'PATCH',
    body: updateMeasurementRequestSchema.parse(input),
    schema: measurementEnvelopeSchema,
  }).then((r) => r.measurement);
}

export function deleteMeasurement(clientId: string, mid: string): Promise<{ ok: boolean }> {
  return apiFetch(`/clients/${clientId}/measurements/${mid}`, {
    method: 'DELETE',
    schema: okEnvelopeSchema,
  });
}

/** Список замеров клиента. */
export function useClientMeasurements(clientId: string) {
  return useQuery({
    queryKey: measurementsQueryKey(clientId),
    queryFn: () => listClientMeasurements(clientId),
    enabled: clientId.length > 0,
  });
}

export function useCreateMeasurement(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMeasurementRequest) => createMeasurement(clientId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: measurementsQueryKey(clientId) });
    },
  });
}

export interface UpdateMeasurementArgs {
  mid: string;
  input: UpdateMeasurementRequest;
}

export function useUpdateMeasurement(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ mid, input }: UpdateMeasurementArgs) => updateMeasurement(clientId, mid, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: measurementsQueryKey(clientId) });
    },
  });
}

export function useDeleteMeasurement(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mid: string) => deleteMeasurement(clientId, mid),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: measurementsQueryKey(clientId) });
    },
  });
}
