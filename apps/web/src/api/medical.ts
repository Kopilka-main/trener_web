import { z } from 'zod';
import {
  medicalRecordResponseSchema,
  medicalRecordListResponseSchema,
  type MedicalRecordResponse,
} from '@trener/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from './client';

const recordEnvelopeSchema = z.object({ record: medicalRecordResponseSchema });

export const medicalRecordsQueryKey = (clientId: string) =>
  ['clients', clientId, 'medical'] as const;

/** URL приватного файла (раздаётся защищённым роутом по cookie-сессии). */
export function fileUrl(fileId: string): string {
  return `/api/files/${fileId}`;
}

/** Список записей медкарты клиента (новые сверху — сортируем на клиенте). */
export function listMedicalRecords(clientId: string): Promise<MedicalRecordResponse[]> {
  return apiFetch(`/clients/${clientId}/medical`, {
    schema: medicalRecordListResponseSchema,
  }).then((r) =>
    [...r.records].sort(
      (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    ),
  );
}

export interface CreateMedicalRecordInput {
  /** Дата записи в формате YYYY-MM-DD. */
  date: string;
  /** Текст заметки (обязателен на бэке: min 1, max 4000). */
  note: string;
  /** Опциональный файл (multipart-часть `file`). */
  file?: File | null;
}

/**
 * Создаёт запись медкарты. Бэк принимает multipart (поля date/note + опц. файл `file`),
 * поэтому шлём FormData напрямую через fetch — `apiFetch` JSON-only.
 */
export async function createMedicalRecord(
  clientId: string,
  input: CreateMedicalRecordInput,
): Promise<MedicalRecordResponse> {
  const form = new FormData();
  form.append('date', input.date);
  form.append('note', input.note);
  if (input.file) {
    form.append('file', input.file, input.file.name);
  }

  // Content-Type не задаём вручную — браузер выставит boundary сам.
  const res = await fetch(`/api/clients/${clientId}/medical`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });

  if (!res.ok) {
    let code = 'UNKNOWN';
    let message = res.statusText || `Ошибка запроса (${String(res.status)})`;
    try {
      const body = (await res.json()) as { error?: unknown; code?: unknown };
      if (typeof body.code === 'string') code = body.code;
      if (typeof body.error === 'string') message = body.error;
    } catch {
      // тело не JSON — оставляем дефолты
    }
    throw new ApiError(res.status, code, message);
  }

  const data: unknown = await res.json();
  return recordEnvelopeSchema.parse(data).record;
}

export function deleteMedicalRecord(clientId: string, recordId: string): Promise<unknown> {
  return apiFetch(`/clients/${clientId}/medical/${recordId}`, {
    method: 'DELETE',
    schema: z.object({ ok: z.literal(true) }),
  });
}

/** Записи медкарты клиента (новые сверху). */
export function useMedicalRecords(clientId: string) {
  return useQuery({
    queryKey: medicalRecordsQueryKey(clientId),
    queryFn: () => listMedicalRecords(clientId),
    enabled: clientId.length > 0,
  });
}

export function useCreateMedicalRecord(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMedicalRecordInput) => createMedicalRecord(clientId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: medicalRecordsQueryKey(clientId) });
    },
  });
}

export function useDeleteMedicalRecord(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (recordId: string) => deleteMedicalRecord(clientId, recordId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: medicalRecordsQueryKey(clientId) });
    },
  });
}
