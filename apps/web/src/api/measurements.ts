import { z } from 'zod';
import {
  createMeasurementRequestSchema,
  updateMeasurementRequestSchema,
  measurementResponseSchema,
  measurementListResponseSchema,
  createMeasurementTaskSchema,
  measurementTaskResponseSchema,
  measurementTaskListResponseSchema,
  type MeasurementResponse,
  type CreateMeasurementRequest,
  type UpdateMeasurementRequest,
  type MeasurementTaskResponse,
  type CreateMeasurementTask,
} from '@trener/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';

const measurementEnvelopeSchema = z.object({ measurement: measurementResponseSchema });
const measurementTaskEnvelopeSchema = z.object({ task: measurementTaskResponseSchema });
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

// ─── Задачи на замеры ──────────────────────────────────────────────────────────

export const measurementTasksQueryKey = (clientId: string) =>
  ['clients', clientId, 'measurement-tasks'] as const;

export function listClientMeasurementTasks(clientId: string): Promise<MeasurementTaskResponse[]> {
  return apiFetch(`/clients/${clientId}/measurement-tasks`, {
    schema: measurementTaskListResponseSchema,
  }).then((r) => r.tasks);
}

export function createMeasurementTask(
  clientId: string,
  input: CreateMeasurementTask,
): Promise<MeasurementTaskResponse> {
  return apiFetch(`/clients/${clientId}/measurement-tasks`, {
    method: 'POST',
    body: createMeasurementTaskSchema.parse(input),
    schema: measurementTaskEnvelopeSchema,
  }).then((r) => r.task);
}

export function cancelMeasurementTask(clientId: string, tid: string): Promise<{ ok: boolean }> {
  return apiFetch(`/clients/${clientId}/measurement-tasks/${tid}`, {
    method: 'DELETE',
    schema: okEnvelopeSchema,
  });
}

/** Список открытых задач на замеры клиента. */
export function useClientMeasurementTasks(clientId: string) {
  return useQuery({
    queryKey: measurementTasksQueryKey(clientId),
    queryFn: () => listClientMeasurementTasks(clientId),
    enabled: clientId.length > 0,
  });
}

export function useCreateMeasurementTask(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMeasurementTask) => createMeasurementTask(clientId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: measurementTasksQueryKey(clientId) });
    },
  });
}

export function useCancelMeasurementTask(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tid: string) => cancelMeasurementTask(clientId, tid),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: measurementTasksQueryKey(clientId) });
    },
  });
}
