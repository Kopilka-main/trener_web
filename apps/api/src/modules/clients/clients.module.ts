import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { Db } from '../../db/client.js';
import { makeClientsRepo } from './clients.repo.js';
import { makeClientsService } from './clients.service.js';
import { makeRequireClientAccess } from '../../plugins/require-client-access.js';
import { clientsRoutes } from './clients.routes.js';

// Регистрация доменного модуля clients в composition root: собирает repo+service+guard
// и навешивает HTTP-роуты. Здесь (НЕ в *.routes.ts) допустим импорт repo/db.
export function registerClientsModule(app: FastifyInstance, deps: { db: Db }): void {
  const repo = makeClientsRepo(deps.db);
  const svc = makeClientsService(repo, { newId: () => randomUUID() });
  const requireClientAccess = makeRequireClientAccess(repo);
  clientsRoutes(app, svc, requireClientAccess);
}
