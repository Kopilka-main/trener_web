import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { Clock } from '../../core/app-deps.js';
import { makeMeasurementsRepo, makeMeasurementTasksRepo } from './measurements.repo.js';
import { makeMeasurementsService } from './measurements.service.js';
import { makeMeasurementTasksService } from './measurement-tasks.service.js';
import { makeClientsRepo } from '../clients/clients.repo.js';
import { makeRequireClientAccess } from '../../plugins/require-client-access.js';
import { measurementsRoutes } from './measurements.routes.js';
import { measurementTasksRoutes } from './measurement-tasks.routes.js';

type TaskPushPayload = { title: string; body: string; url?: string };

// Регистрация доменного модуля measurements в composition root: собирает
// repo+service+guard и навешивает HTTP-роуты. Guard переиспользует clients-repo
// (связь тренер↔клиент). Здесь (НЕ в *.routes.ts) допустим импорт repo/db.
export function registerMeasurementsModule(
  app: FastifyInstance,
  deps: {
    db: Db;
    clock: Clock;
    notifyClient?: (
      clientId: string,
      trainerId: string,
      build: (trainerName: string) => TaskPushPayload,
    ) => void;
  },
): void {
  const tasksRepo = makeMeasurementTasksRepo(deps.db);
  const tasksSvc = makeMeasurementTasksService(tasksRepo, {
    newId: deps.clock.newId,
    now: deps.clock.now,
    ...(deps.notifyClient ? { notifyClient: deps.notifyClient } : {}),
  });

  const repo = makeMeasurementsRepo(deps.db);
  const svc = makeMeasurementsService(repo, {
    newId: deps.clock.newId,
    // Замер внесён тренером → закрываем открытые задачи на замеры.
    onMeasurementCreated: (trainerId, clientId) => tasksSvc.resolveOpen(trainerId, clientId),
  });

  const requireClientAccess = makeRequireClientAccess(makeClientsRepo(deps.db));
  measurementsRoutes(app, svc, requireClientAccess);
  measurementTasksRoutes(app, tasksSvc, requireClientAccess);
}
