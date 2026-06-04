import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { ClientLink } from '@trener/shared';
import type { FilesRepo } from '../files/files.repo.js';
import type { Storage } from '../../files/storage.js';
import { makeAuthRepo } from '../auth/auth.repo.js';
import { makeClientAuthRepo } from '../client-auth/client-auth.repo.js';
import { clientAppTrainerRoutes } from './client-app-trainer.routes.js';

export function registerClientAppTrainerModule(
  app: FastifyInstance,
  deps: {
    db: Db;
    filesRepo: FilesRepo;
    storage: Storage;
    resolveScope: (id: string) => Promise<ClientLink>;
  },
): void {
  const clientRepo = makeClientAuthRepo(deps.db);
  clientAppTrainerRoutes(
    app,
    makeAuthRepo(deps.db),
    deps.filesRepo,
    deps.storage,
    deps.resolveScope,
    { detachAccountFromClient: (id) => clientRepo.detachAccountFromClient(id) },
  );
}
