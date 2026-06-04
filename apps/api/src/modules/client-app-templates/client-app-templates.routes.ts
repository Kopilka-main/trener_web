import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  clientTemplateListResponseSchema,
  clientTemplateResponseSchema,
  saveClientTemplateRequestSchema,
} from '@trener/shared';
import type { ClientTemplatesService } from './client-app-templates.service.js';
import { requireClient } from '../../plugins/client-context.js';
import { makeClientScope, type ResolveScope } from '../../core/client-scope.js';

const idParams = z.object({ id: z.string().min(1) });
const templateWrap = z.object({ template: clientTemplateResponseSchema });
const okResponse = z.object({ ok: z.literal(true) });

export function clientAppTemplatesRoutes(
  app: FastifyInstance,
  svc: ClientTemplatesService,
  resolveScope: ResolveScope,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const scope = makeClientScope(resolveScope);

  typed.get(
    '/api/client/templates',
    { preHandler: requireClient, schema: { response: { 200: clientTemplateListResponseSchema } } },
    async (req) => {
      const { trainerId, clientId } = await scope(req);
      return { templates: await svc.list(trainerId, clientId) };
    },
  );

  typed.post(
    '/api/client/templates',
    {
      preHandler: requireClient,
      schema: { body: saveClientTemplateRequestSchema, response: { 201: templateWrap } },
    },
    async (req, reply) => {
      const { trainerId, clientId } = await scope(req);
      const template = await svc.save(trainerId, clientId, req.body);
      void reply.status(201);
      return { template };
    },
  );

  typed.delete(
    '/api/client/templates/:id',
    { preHandler: requireClient, schema: { params: idParams, response: { 200: okResponse } } },
    async (req) => {
      const { trainerId, clientId } = await scope(req);
      await svc.remove(trainerId, clientId, req.params.id);
      return { ok: true as const };
    },
  );
}
