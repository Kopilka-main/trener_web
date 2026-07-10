import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { Clock } from '../../core/app-deps.js';
import type { Storage } from '../../files/storage.js';
import type { ClientLink } from '@trener/shared';
import { makeProgressPhotosRepo } from '../progress-photos/progress-photos.repo.js';
import { makeProgressPhotosService } from '../progress-photos/progress-photos.service.js';
import { makeFilesRepo } from '../files/files.repo.js';
import { clientAppProgressPhotosRoutes } from './client-app-progress-photos.routes.js';

type TrainerPushPayload = { title: string; body: string; url?: string };

// Регистрация progress-photos для клиентского приложения: переиспользует сервис
// тренерского модуля (scoped по trainerId+clientId), scope приходит из resolveScope.
export function registerClientAppProgressPhotosModule(
  app: FastifyInstance,
  deps: {
    db: Db;
    storage: Storage;
    clock: Clock;
    resolveScope: (id: string) => Promise<ClientLink>;
    // Пуш ТРЕНЕРУ (клиент добавил фото): build получает имя КЛИЕНТА. Fire-and-forget.
    notifyTrainer?: (
      trainerId: string,
      clientId: string,
      build: (clientName: string) => TrainerPushPayload,
    ) => void;
  },
): void {
  const repo = makeProgressPhotosRepo(deps.db);
  const filesRepo = makeFilesRepo(deps.db);
  const svc = makeProgressPhotosService(repo, filesRepo, deps.storage, {
    newId: deps.clock.newId,
    // Автор — клиент (клиентский контур).
    createdByClient: true,
  });
  clientAppProgressPhotosRoutes(
    app,
    svc,
    filesRepo,
    deps.storage,
    deps.resolveScope,
    deps.notifyTrainer,
  );
}
