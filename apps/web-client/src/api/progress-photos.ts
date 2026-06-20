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
const okEnvelope = z.object({ ok: z.boolean() });

export const progressPhotosQueryKey = ['client', 'progress-photos'] as const;

/** URL приватного файла для <img>: тот же origin, cookie-сессия уходит автоматически. */
export function fileUrl(fileId: string): string {
  return `/api/client/files/${fileId}`;
}

/** Список фото прогресса клиента. */
export function listClientProgressPhotos(): Promise<PhotoResponse[]> {
  return apiFetch('/client/progress-photos', {
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
export async function uploadProgressPhoto({
  file,
  date,
  angle,
  note,
}: UploadPhotoArgs): Promise<PhotoResponse> {
  const form = new FormData();
  form.append('photo', file);
  form.append('date', date);
  form.append('angle', angle);
  if (note !== undefined && note !== '') form.append('note', note);

  const res = await fetch('/api/client/progress-photos', {
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

export function deleteProgressPhoto(pid: string): Promise<{ ok: boolean }> {
  return apiFetch(`/client/progress-photos/${pid}`, {
    method: 'DELETE',
    schema: okEnvelope,
  });
}

/** Фото прогресса клиента. Непривязанный (409) → пустой список, не ошибка. */
export function useClientProgressPhotos() {
  return useQuery<PhotoResponse[]>({
    queryKey: progressPhotosQueryKey,
    queryFn: async () => {
      try {
        return await listClientProgressPhotos();
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) return [];
        throw err;
      }
    },
  });
}

export function useUploadProgressPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: UploadPhotoArgs) => uploadProgressPhoto(args),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: progressPhotosQueryKey });
    },
  });
}

export function useDeleteProgressPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pid: string) => deleteProgressPhoto(pid),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: progressPhotosQueryKey });
    },
  });
}
