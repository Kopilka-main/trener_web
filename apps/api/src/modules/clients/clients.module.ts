import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { Clock } from '../../core/app-deps.js';
import type { Storage } from '../../files/storage.js';
import { makeClientsRepo } from './clients.repo.js';
import { makeClientsService } from './clients.service.js';
import { makeFilesRepo } from '../files/files.repo.js';
import { makeRequireClientAccess } from '../../plugins/require-client-access.js';
import { clientsRoutes } from './clients.routes.js';

// Регистрация доменного модуля clients в composition root: собирает repo+service+guard
// и навешивает HTTP-роуты. Здесь (НЕ в *.routes.ts) допустим импорт repo/db/storage.
export function registerClientsModule(
  app: FastifyInstance,
  deps: { db: Db; storage: Storage; clock: Clock },
): void {
  const repo = makeClientsRepo(deps.db);
  const filesRepo = makeFilesRepo(deps.db);
  const svc = makeClientsService(repo, filesRepo, deps.storage, { newId: deps.clock.newId });
  const requireClientAccess = makeRequireClientAccess(repo);
  clientsRoutes(app, svc, requireClientAccess);
}
