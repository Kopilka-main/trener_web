import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createClientRequestSchema,
  updateClientRequestSchema,
  clientResponseSchema,
  clientListResponseSchema,
} from '@trener/shared';
import type { ClientsService } from './clients.service.js';
import { requireAuth } from '../../plugins/tenant-context.js';
import { makeRequireClientAccess } from '../../plugins/require-client-access.js';
import { unauthorized } from '../../errors.js';

// guard связи тренер↔клиент — импортируем тип из плагина (не repo/db),
// чтобы HTTP-слой не нарушал границу *.routes.ts ↔ *.repo/**/db.
type RequireClientAccess = ReturnType<typeof makeRequireClientAccess>;

const idParams = z.object({ id: z.string() });
const clientWrap = z.object({ client: clientResponseSchema });

// HTTP-слой clients: только роуты. Сборка repo/service/guard — в clients.module.ts
// (граница слоёв: *.routes.ts не импортирует *.repo/**/db).
export function clientsRoutes(
  app: FastifyInstance,
  svc: ClientsService,
  requireClientAccess: RequireClientAccess,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  function trainerId(req: { trainerId?: string }): string {
    if (!req.trainerId) throw unauthorized('Требуется вход');
    return req.trainerId;
  }

  typed.post(
    '/api/clients',
    {
      preHandler: requireAuth,
      schema: { body: createClientRequestSchema, response: { 201: clientWrap } },
    },
    async (req, reply) => {
      const client = await svc.create(trainerId(req), req.body);
      void reply.status(201);
      return { client };
    },
  );

  typed.get(
    '/api/clients',
    { preHandler: requireAuth, schema: { response: { 200: clientListResponseSchema } } },
    async (req) => ({ clients: await svc.list(trainerId(req)) }),
  );

  typed.get(
    '/api/clients/:id',
    {
      preHandler: [requireAuth, requireClientAccess],
      schema: { params: idParams, response: { 200: clientWrap } },
    },
    async (req) => ({ client: await svc.get(trainerId(req), req.params.id) }),
  );

  typed.patch(
    '/api/clients/:id',
    {
      preHandler: [requireAuth, requireClientAccess],
      schema: { params: idParams, body: updateClientRequestSchema, response: { 200: clientWrap } },
    },
    async (req) => ({ client: await svc.update(trainerId(req), req.params.id, req.body) }),
  );

  typed.delete(
    '/api/clients/:id',
    {
      preHandler: [requireAuth, requireClientAccess],
      schema: { params: idParams, response: { 200: z.object({ ok: z.literal(true) }) } },
    },
    async (req) => {
      await svc.unlink(trainerId(req), req.params.id);
      return { ok: true as const };
    },
  );
}
