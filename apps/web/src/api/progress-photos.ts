import { z } from 'zod';
import {
  photoResponseSchema,
  photoListResponseSchema,
  type PhotoResponse,
  type Angle,
} from '@trener/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiFetch } from './client';

const photoEnvelopeSchema = z.object({ photo: photoResponseSchema });

export const progressPhotosQueryKey = (clientId: string) =>
  ['clients', clientId, 'progress-photos'] as const;

/** URL приватного файла для <img>: тот же origin, cookie-сессия уходит автоматически. */
export function fileUrl(fileId: string): string {
  return `/api/files/${fileId}`;
}

export function listClientProgressPhotos(clientId: string): Promise<PhotoResponse[]> {
  return apiFetch(`/clients/${clientId}/progress-photos`, {
    schema: photoListResponseSchema,
  }).then((r) => r.photos);
}

export interface UploadPhotoArgs {
  file: File;
  date: string;
  angle: Angle;
  note?: string;
}

interface ApiErrorBody {
  error?: unknown;
  code?: unknown;
}

/**
 * Загрузка фото — multipart/form-data. apiFetch только для JSON, поэтому здесь
 * отдельный fetch с credentials:'include' и БЕЗ ручного Content-Type
 * (браузер сам проставит boundary).
 */
export async function uploadProgressPhoto(
  clientId: string,
  { file, date, angle, note }: UploadPhotoArgs,
): Promise<PhotoResponse> {
  const form = new FormData();
  form.append('photo', file);
  form.append('date', date);
  form.append('angle', angle);
  if (note !== undefined && note !== '') form.append('note', note);

  const res = await fetch(`/api/clients/${clientId}/progress-photos`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });

  if (!res.ok) {
    let code = 'UNKNOWN';
    let message = res.statusText || `Ошибка запроса (${String(res.status)})`;
    try {
      const errBody = (await res.json()) as ApiErrorBody;
      if (typeof errBody.code === 'string') code = errBody.code;
      if (typeof errBody.error === 'string') message = errBody.error;
    } catch {
      // тело не JSON — оставляем дефолты
    }
    throw new ApiError(res.status, code, message);
  }

  const data: unknown = await res.json();
  return photoEnvelopeSchema.parse(data).photo;
}

export function deleteProgressPhoto(clientId: string, pid: string): Promise<{ ok: boolean }> {
  return apiFetch(`/clients/${clientId}/progress-photos/${pid}`, {
    method: 'DELETE',
    schema: z.object({ ok: z.boolean() }),
  });
}

/** Список фото прогресса клиента. */
export function useClientProgressPhotos(clientId: string) {
  return useQuery({
    queryKey: progressPhotosQueryKey(clientId),
    queryFn: () => listClientProgressPhotos(clientId),
    enabled: clientId.length > 0,
  });
}

export function useUploadProgressPhoto(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: UploadPhotoArgs) => uploadProgressPhoto(clientId, args),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: progressPhotosQueryKey(clientId) });
    },
  });
}

export function useDeleteProgressPhoto(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pid: string) => deleteProgressPhoto(clientId, pid),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: progressPhotosQueryKey(clientId) });
    },
  });
}
