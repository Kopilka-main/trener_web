import { z } from 'zod';
import {
  createTemplateRequestSchema,
  updateTemplateRequestSchema,
  templateResponseSchema,
  templateListResponseSchema,
  type TemplateResponse,
  type CreateTemplateRequest,
  type UpdateTemplateRequest,
} from '@trener/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';

const templateEnvelopeSchema = z.object({ template: templateResponseSchema });
const okEnvelopeSchema = z.object({ ok: z.boolean() });

export const templatesQueryKey = ['templates'] as const;
export const templateQueryKey = (id: string) => ['templates', id] as const;

export function listTemplates(): Promise<TemplateResponse[]> {
  return apiFetch('/workout-templates', { schema: templateListResponseSchema }).then(
    (r) => r.templates,
  );
}

export function getTemplate(id: string): Promise<TemplateResponse> {
  return apiFetch(`/workout-templates/${id}`, { schema: templateEnvelopeSchema }).then(
    (r) => r.template,
  );
}

export function createTemplate(input: CreateTemplateRequest): Promise<TemplateResponse> {
  return apiFetch('/workout-templates', {
    method: 'POST',
    body: createTemplateRequestSchema.parse(input),
    schema: templateEnvelopeSchema,
  }).then((r) => r.template);
}

export function updateTemplate(
  id: string,
  input: UpdateTemplateRequest,
): Promise<TemplateResponse> {
  return apiFetch(`/workout-templates/${id}`, {
    method: 'PATCH',
    body: updateTemplateRequestSchema.parse(input),
    schema: templateEnvelopeSchema,
  }).then((r) => r.template);
}

export function deleteTemplate(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/workout-templates/${id}`, { method: 'DELETE', schema: okEnvelopeSchema });
}

/** Шаблоны тренировок тренера. */
export function useTemplates() {
  return useQuery({
    queryKey: templatesQueryKey,
    queryFn: listTemplates,
  });
}

/** Один шаблон по id. */
export function useTemplate(id: string) {
  return useQuery({
    queryKey: templateQueryKey(id),
    queryFn: () => getTemplate(id),
    enabled: id.length > 0,
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createTemplate,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: templatesQueryKey });
    },
  });
}

export function useUpdateTemplate(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateTemplateRequest) => updateTemplate(id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: templatesQueryKey });
      void qc.invalidateQueries({ queryKey: templateQueryKey(id) });
    },
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteTemplate,
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: templatesQueryKey });
      void qc.invalidateQueries({ queryKey: templateQueryKey(id) });
    },
  });
}
