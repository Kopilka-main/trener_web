import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { packageListResponseSchema } from '@trener/shared';
import type { PackagesService } from '../packages/packages.service.js';
import { requireClient } from '../../plugins/client-context.js';
import { makeClientScope, type ResolveScope } from '../../core/client-scope.js';

// Фасад: пакеты текущего клиента (read-only) — для уведомления о заканчивающемся пакете.
export function clientAppPackagesRoutes(
  app: FastifyInstance,
  svc: PackagesService,
  resolveScope: ResolveScope,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const scope = makeClientScope(resolveScope);

  typed.get(
    '/api/client/packages',
    { preHandler: requireClient, schema: { response: { 200: packageListResponseSchema } } },
    async (req) => {
      const { trainerId, clientId } = await scope(req);
      return { packages: await svc.list(trainerId, clientId) };
    },
  );
}
