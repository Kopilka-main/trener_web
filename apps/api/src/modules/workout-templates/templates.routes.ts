import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createTemplateRequestSchema,
  updateTemplateRequestSchema,
  templateResponseSchema,
  templateListResponseSchema,
} from '@trener/shared';
import type { TemplatesService } from './templates.service.js';
import { requireAuth } from '../../plugins/tenant-context.js';
import { unauthorized } from '../../errors.js';

const idParams = z.object({ id: z.string() });
const templateWrap = z.object({ template: templateResponseSchema });

// HTTP-слой шаблонов: только роуты. Сборка repo/service — в templates.module.ts
// (граница слоёв: *.routes.ts не импортирует *.repo/**/db).
// Каталог тренера (личные шаблоны), НЕ вложен под клиента → только requireAuth.
export function templatesRoutes(app: FastifyInstance, svc: TemplatesService): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  function trainerId(req: { trainerId?: string }): string {
    if (!req.trainerId) throw unauthorized('Требуется вход');
    return req.trainerId;
  }

  typed.get(
    '/api/workout-templates',
    { preHandler: requireAuth, schema: { response: { 200: templateListResponseSchema } } },
    async (req) => ({ templates: await svc.list(trainerId(req)) }),
  );

  typed.get(
    '/api/workout-templates/:id',
    { preHandler: requireAuth, schema: { params: idParams, response: { 200: templateWrap } } },
    async (req) => ({ template: await svc.get(trainerId(req), req.params.id) }),
  );

  typed.post(
    '/api/workout-templates',
    {
      preHandler: requireAuth,
      schema: { body: createTemplateRequestSchema, response: { 201: templateWrap } },
    },
    async (req, reply) => {
      const template = await svc.create(trainerId(req), req.body);
      void reply.status(201);
      return { template };
    },
  );

  typed.patch(
    '/api/workout-templates/:id',
    {
      preHandler: requireAuth,
      schema: {
        params: idParams,
        body: updateTemplateRequestSchema,
        response: { 200: templateWrap },
      },
    },
    async (req) => ({ template: await svc.update(trainerId(req), req.params.id, req.body) }),
  );

  typed.delete(
    '/api/workout-templates/:id',
    {
      preHandler: requireAuth,
      schema: { params: idParams, response: { 200: z.object({ ok: z.literal(true) }) } },
    },
    async (req) => {
      await svc.remove(trainerId(req), req.params.id);
      return { ok: true as const };
    },
  );
}
