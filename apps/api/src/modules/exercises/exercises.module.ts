import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { Clock } from '../../core/app-deps.js';
import { makeExercisesRepo } from './exercises.repo.js';
import { makeExercisesService } from './exercises.service.js';
import { exercisesRoutes } from './exercises.routes.js';

// Регистрация доменного модуля exercises в composition root: собирает repo+service
// и навешивает HTTP-роуты. Здесь (НЕ в *.routes.ts) допустим импорт repo/db.
export function registerExercisesModule(
  app: FastifyInstance,
  deps: { db: Db; clock: Clock },
): void {
  const repo = makeExercisesRepo(deps.db);
  const svc = makeExercisesService(repo, { newId: deps.clock.newId });
  exercisesRoutes(app, svc);
}
