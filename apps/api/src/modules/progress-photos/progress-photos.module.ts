import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { Clock } from '../../core/app-deps.js';
import type { Storage } from '../../files/storage.js';
import { makeProgressPhotosRepo } from './progress-photos.repo.js';
import { makeProgressPhotosService } from './progress-photos.service.js';
import { makeFilesRepo } from '../files/files.repo.js';
import { makeClientsRepo } from '../clients/clients.repo.js';
import { makeRequireClientAccess } from '../../plugins/require-client-access.js';
import { progressPhotosRoutes } from './progress-photos.routes.js';

// Регистрация доменного модуля progress-photos в composition root: собирает
// repo+filesRepo+service+guard и навешивает HTTP-роуты. Здесь (НЕ в *.routes.ts)
// допустим импорт repo/db/storage.
export function registerProgressPhotosModule(
  app: FastifyInstance,
  deps: { db: Db; storage: Storage; clock: Clock },
): void {
  const repo = makeProgressPhotosRepo(deps.db);
  const filesRepo = makeFilesRepo(deps.db);
  const svc = makeProgressPhotosService(repo, filesRepo, deps.storage, { newId: deps.clock.newId });
  const requireClientAccess = makeRequireClientAccess(makeClientsRepo(deps.db));
  progressPhotosRoutes(app, svc, requireClientAccess);
}
