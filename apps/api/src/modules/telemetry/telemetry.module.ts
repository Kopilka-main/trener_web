import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import type { Db } from '../../db/client.js';
import type { Clock } from '../../core/app-deps.js';
import { makeTelemetryRepo } from './telemetry.repo.js';
import { makeTelemetryService, type TelemetryService } from './telemetry.service.js';
import { telemetryRoutes } from './telemetry.routes.js';

export function makeTelemetry(db: Db, clock: Clock): TelemetryService {
  return makeTelemetryService(makeTelemetryRepo(db), { newId: clock.newId });
}

export async function registerTelemetryRoutes(
  app: FastifyInstance,
  svc: TelemetryService,
): Promise<void> {
  await app.register(async (scope) => {
    await scope.register(rateLimit, { max: 120, timeWindow: '1 minute' });
    telemetryRoutes(scope, svc);
  });
}
