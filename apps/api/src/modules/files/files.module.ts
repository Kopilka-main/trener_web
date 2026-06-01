import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { Storage } from '../../files/storage.js';
import { makeFilesRepo } from './files.repo.js';
import { filesRoutes } from './files.routes.js';

// Регистрация модуля files в composition root: собирает repo и навешивает
// защищённую раздачу. Здесь (НЕ в *.routes.ts) допустим импорт repo/db.
export function registerFilesModule(
  app: FastifyInstance,
  deps: { db: Db; storage: Storage },
): void {
  const repo = makeFilesRepo(deps.db);
  filesRoutes(app, repo, deps.storage);
}
