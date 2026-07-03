import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { Clock } from '../../core/app-deps.js';
import type { Storage } from '../../files/storage.js';
import { makeClientsRepo } from './clients.repo.js';
import { makeClientsService } from './clients.service.js';
import { makeFilesRepo } from '../files/files.repo.js';
import { makeRequireClientAccess } from '../../plugins/require-client-access.js';
import { makeClientAuthRepo } from '../client-auth/client-auth.repo.js';
import { clientsRoutes } from './clients.routes.js';

// Регистрация доменного модуля clients в composition root: собирает repo+service+guard
// и навешивает HTTP-роуты. Здесь (НЕ в *.routes.ts) допустим импорт repo/db/storage.
export function registerClientsModule(
  app: FastifyInstance,
  deps: {
    db: Db;
    storage: Storage;
    clock: Clock;
    // Пуш ТРЕНЕРУ при подключении клиента (привязка accountId). Fire-and-forget.
    notifyLinked?: (
      trainerId: string,
      clientId: string,
      firstName: string,
      lastName: string,
    ) => void;
  },
): void {
  const repo = makeClientsRepo(deps.db);
  const filesRepo = makeFilesRepo(deps.db);
  const clientAuthRepo = makeClientAuthRepo(deps.db);
  const svc = makeClientsService(repo, filesRepo, deps.storage, {
    newId: deps.clock.newId,
    accountExists: (id) => clientAuthRepo.accountExists(id),
    accountProfile: async (id) => {
      const a = await clientAuthRepo.findAccountById(id);
      if (!a) return null;
      return {
        firstName: a.firstName,
        lastName: a.lastName,
        birthDate: a.birthDate,
        contacts: a.contacts,
      };
    },
    accountAvatarFileId: (id) => clientAuthRepo.findAvatarFileId(id),
    ...(deps.notifyLinked ? { notifyLinked: deps.notifyLinked } : {}),
  });
  const requireClientAccess = makeRequireClientAccess(repo);
  clientsRoutes(app, svc, requireClientAccess, deps.storage);
}
