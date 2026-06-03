import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import type { Db } from '../../db/client.js';
import type { Clock } from '../../core/app-deps.js';
import { makeClientAuthRepo } from './client-auth.repo.js';
import { makeClientAuthService } from './client-auth.service.js';
import { clientContext } from '../../plugins/client-context.js';
import { clientAuthRoutes } from './client-auth.routes.js';

// Возвращает сервис, чтобы composition root мог переиспользовать резолвер скоупа
// в будущих фичевых клиентских модулях (секционные спеки).
export async function registerClientAuthModule(
  app: FastifyInstance,
  deps: { db: Db; clock: Clock; isProd: boolean },
): Promise<ReturnType<typeof makeClientAuthService>> {
  const repo = makeClientAuthRepo(deps.db);
  const svc = makeClientAuthService(repo, deps.clock);

  await app.register(clientContext, { findSession: (id) => repo.findSession(id) });

  await app.register(async (scope) => {
    await scope.register(rateLimit, { max: 20, timeWindow: '1 minute' });
    clientAuthRoutes(scope, svc, deps.isProd);
  });

  return svc;
}
