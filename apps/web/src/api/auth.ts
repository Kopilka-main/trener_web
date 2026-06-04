import { z } from 'zod';
import {
  loginRequestSchema,
  registerRequestSchema,
  trainerResponseSchema,
  updateTrainerRequestSchema,
  type LoginRequest,
  type RegisterRequest,
  type TrainerResponse,
  type UpdateTrainerRequest,
} from '@trener/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiFetch } from './client';

const trainerEnvelopeSchema = z.object({ trainer: trainerResponseSchema });
const okEnvelopeSchema = z.object({ ok: z.boolean() });

export const meQueryKey = ['me'] as const;

export function register(input: RegisterRequest): Promise<{ trainer: TrainerResponse }> {
  return apiFetch('/auth/register', {
    method: 'POST',
    body: registerRequestSchema.parse(input),
    schema: trainerEnvelopeSchema,
  });
}

export function login(input: LoginRequest): Promise<{ trainer: TrainerResponse }> {
  return apiFetch('/auth/login', {
    method: 'POST',
    body: loginRequestSchema.parse(input),
    schema: trainerEnvelopeSchema,
  });
}

export function logout(): Promise<undefined> {
  return apiFetch('/auth/logout', { method: 'POST' });
}

export function getMe(): Promise<{ trainer: TrainerResponse }> {
  return apiFetch('/auth/me', { schema: trainerEnvelopeSchema });
}

export function updateMe(input: UpdateTrainerRequest): Promise<{ trainer: TrainerResponse }> {
  return apiFetch('/auth/me', {
    method: 'PATCH',
    body: updateTrainerRequestSchema.parse(input),
    schema: trainerEnvelopeSchema,
  });
}

interface ApiErrorBody {
  error?: unknown;
  code?: unknown;
}

/**
 * Загрузка своего аватара — multipart/form-data. apiFetch только для JSON, поэтому
 * здесь отдельный fetch с credentials:'include' и БЕЗ ручного Content-Type (браузер
 * сам проставит boundary). Поле `photo` — как в аватаре клиента.
 */
export async function uploadMyAvatar(blob: Blob): Promise<{ trainer: TrainerResponse }> {
  const form = new FormData();
  form.append('photo', blob, 'avatar.jpg');

  const res = await fetch('/api/auth/me/avatar', {
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
  return trainerEnvelopeSchema.parse(data);
}

export function removeMyAvatar(): Promise<{ ok: boolean }> {
  return apiFetch('/auth/me/avatar', { method: 'DELETE', schema: okEnvelopeSchema });
}

/** Текущий тренер. retry:false — 401 не ретраить, это нормальное «не залогинен». */
export function useMe() {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: getMe,
    retry: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: login,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: meQueryKey });
    },
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: register,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: meQueryKey });
    },
  });
}

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateMe,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: meQueryKey });
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: meQueryKey });
    },
  });
}

export function useUploadMyAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (blob: Blob) => uploadMyAvatar(blob),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: meQueryKey });
    },
  });
}

export function useRemoveMyAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: removeMyAvatar,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: meQueryKey });
    },
  });
}
