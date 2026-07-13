import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { Clock } from '../../core/app-deps.js';
import { makeClientWorkoutsRepo } from './client-workouts.repo.js';
import { makeClientWorkoutsService } from './client-workouts.service.js';
import { makeClientsRepo } from '../clients/clients.repo.js';
import { makeRequireClientAccess } from '../../plugins/require-client-access.js';
import { clientWorkoutsRoutes } from './client-workouts.routes.js';

// Регистрация доменного модуля client-workouts в composition root: собирает
// repo+service+guard и навешивает HTTP-роуты. Guard переиспользует clients-repo
// (связь тренер↔клиент). Здесь (НЕ в *.routes.ts) допустим импорт repo/db.
export function registerClientWorkoutsModule(
  app: FastifyInstance,
  deps: {
    db: Db;
    clock: Clock;
    // Тренер назначил тренировку → пуш клиенту (build получает имя тренера).
    notify?: (
      clientId: string,
      trainerId: string,
      build: (trainerName: string) => { title: string; body: string; url?: string },
    ) => void;
    // Тренировка завершена → связать с календарём (см. sessions.reconcileFromWorkout).
    onCompleted?: (
      trainerId: string,
      clientId: string,
      workoutId: string,
      workoutName: string,
      completedAt: Date,
      tzOffsetMinutes?: number,
    ) => Promise<void> | void;
  },
): void {
  const repo = makeClientWorkoutsRepo(deps.db);
  const svc = makeClientWorkoutsService(repo, {
    newId: deps.clock.newId,
    now: deps.clock.now,
    ...(deps.notify ? { notify: deps.notify } : {}),
    ...(deps.onCompleted ? { onCompleted: deps.onCompleted } : {}),
  });
  const requireClientAccess = makeRequireClientAccess(makeClientsRepo(deps.db));
  clientWorkoutsRoutes(app, svc, requireClientAccess);
}
