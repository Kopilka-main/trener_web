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
import { apiFetch } from './client';

const trainerEnvelopeSchema = z.object({ trainer: trainerResponseSchema });

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
