import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { Clock } from '../../core/app-deps.js';
import type { ClientLink } from '@trener/shared';
import {
  makeMeasurementsRepo,
  makeMeasurementTasksRepo,
} from '../measurements/measurements.repo.js';
import { makeMeasurementsService } from '../measurements/measurements.service.js';
import { makeMeasurementTasksService } from '../measurements/measurement-tasks.service.js';
import { clientAppMeasurementsRoutes } from './client-app-measurements.routes.js';

type TrainerPushPayload = { title: string; body: string; url?: string };

export function registerClientAppMeasurementsModule(
  app: FastifyInstance,
  deps: {
    db: Db;
    clock: Clock;
    resolveScope: (id: string) => Promise<ClientLink>;
    // Пуш ТРЕНЕРУ (клиент добавил замер): build получает имя КЛИЕНТА. Fire-and-forget.
    notifyTrainer?: (
      trainerId: string,
      clientId: string,
      build: (clientName: string) => TrainerPushPayload,
    ) => void;
  },
): void {
  const tasksRepo = makeMeasurementTasksRepo(deps.db);
  const tasksSvc = makeMeasurementTasksService(tasksRepo, {
    newId: deps.clock.newId,
    now: deps.clock.now,
  });
  const svc = makeMeasurementsService(makeMeasurementsRepo(deps.db), {
    newId: deps.clock.newId,
    // Автор — клиент (клиентский контур).
    createdByClient: true,
    // Замер внесён клиентом → закрываем открытые задачи на замеры.
    onMeasurementCreated: (trainerId, clientId) => tasksSvc.resolveOpen(trainerId, clientId),
  });
  clientAppMeasurementsRoutes(app, svc, tasksSvc, deps.resolveScope, deps.notifyTrainer);
}
