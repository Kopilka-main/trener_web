import {
  clientTemplateListResponseSchema,
  clientTemplateResponseSchema,
  saveClientTemplateRequestSchema,
  type ClientTemplateResponse,
  type SaveClientTemplateRequest,
} from '@trener/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch, ApiError } from './client';

const templateWrap = z.object({ template: clientTemplateResponseSchema });
const okWrap = z.object({ ok: z.boolean() });

export const clientTemplatesQueryKey = ['client', 'templates'] as const;

/** Свои шаблоны тренировок. Без привязки к тренеру (409) → пустой список. */
export function useClientTemplates() {
  return useQuery<ClientTemplateResponse[]>({
    queryKey: clientTemplatesQueryKey,
    queryFn: async () => {
      try {
        const r = await apiFetch('/client/templates', { schema: clientTemplateListResponseSchema });
        return r.templates;
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) return [];
        throw err;
      }
    },
  });
}

/** Сохранить тренировку как шаблон → 201 {template}. */
export function useSaveTemplate() {
  const qc = useQueryClient();
  return useMutation<ClientTemplateResponse, ApiError, SaveClientTemplateRequest>({
    mutationFn: (input) =>
      apiFetch('/client/templates', {
        method: 'POST',
        body: saveClientTemplateRequestSchema.parse(input),
        schema: templateWrap,
      }).then((r) => r.template),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientTemplatesQueryKey });
    },
  });
}

/** Удалить свой шаблон. */
export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean }, ApiError, string>({
    mutationFn: (id) => apiFetch(`/client/templates/${id}`, { method: 'DELETE', schema: okWrap }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientTemplatesQueryKey });
    },
  });
}
