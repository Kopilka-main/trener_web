import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createPackageRequestSchema,
  updatePackageRequestSchema,
  packageResponseSchema,
  packageListResponseSchema,
} from '@trener/shared';
import type { PackagesService } from './packages.service.js';
import { requireAuth } from '../../plugins/tenant-context.js';
import type { makeRequireClientAccess } from '../../plugins/require-client-access.js';
import { unauthorized } from '../../errors.js';

// guard связи тренер↔клиент — импортируем тип из плагина (не repo/db),
// чтобы HTTP-слой не нарушал границу *.routes.ts ↔ *.repo/**/db.
type RequireClientAccess = ReturnType<typeof makeRequireClientAccess>;

const clientParams = z.object({ id: z.string() });
const packageParams = z.object({ id: z.string(), pid: z.string() });
const packageWrap = z.object({ package: packageResponseSchema });

// HTTP-слой packages: вложен под клиента (/api/clients/:id/packages...).
// Оба preHandler [requireAuth, requireClientAccess]; принадлежность пакета паре
// проверяется в repo (scope trainerId+clientId → 404 через service).
// Сборка repo/service/guard — в packages.module.ts (граница слоёв).
export function packagesRoutes(
  app: FastifyInstance,
  svc: PackagesService,
  requireClientAccess: RequireClientAccess,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const preHandler = [requireAuth, requireClientAccess];

  function trainerId(req: { trainerId?: string }): string {
    if (!req.trainerId) throw unauthorized('Требуется вход');
    return req.trainerId;
  }

  typed.post(
    '/api/clients/:id/packages',
    {
      preHandler,
      schema: {
        params: clientParams,
        body: createPackageRequestSchema,
        response: { 201: packageWrap },
      },
    },
    async (req, reply) => {
      const pkg = await svc.create(trainerId(req), req.params.id, req.body);
      void reply.status(201);
      return { package: pkg };
    },
  );

  typed.get(
    '/api/clients/:id/packages',
    {
      preHandler,
      schema: { params: clientParams, response: { 200: packageListResponseSchema } },
    },
    async (req) => ({ packages: await svc.list(trainerId(req), req.params.id) }),
  );

  typed.get(
    '/api/clients/:id/packages/:pid',
    {
      preHandler,
      schema: { params: packageParams, response: { 200: packageWrap } },
    },
    async (req) => ({ package: await svc.get(trainerId(req), req.params.id, req.params.pid) }),
  );

  typed.patch(
    '/api/clients/:id/packages/:pid',
    {
      preHandler,
      schema: {
        params: packageParams,
        body: updatePackageRequestSchema,
        response: { 200: packageWrap },
      },
    },
    async (req) => ({
      package: await svc.update(trainerId(req), req.params.id, req.params.pid, req.body),
    }),
  );

  typed.delete(
    '/api/clients/:id/packages/:pid',
    {
      preHandler,
      schema: { params: packageParams, response: { 200: z.object({ ok: z.literal(true) }) } },
    },
    async (req) => {
      await svc.remove(trainerId(req), req.params.id, req.params.pid);
      return { ok: true as const };
    },
  );
}
