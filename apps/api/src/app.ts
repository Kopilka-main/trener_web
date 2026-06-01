import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { Db } from './db/client.js';
import { realClock } from './core/app-deps.js';
import { errorHandler } from './plugins/error-handler.js';
import { tenantContext } from './plugins/tenant-context.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { makeAuthRepo } from './modules/auth/auth.repo.js';
import { makeAuthService } from './modules/auth/auth.service.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { registerClientsModule } from './modules/clients/clients.module.js';
import { registerExercisesModule } from './modules/exercises/exercises.module.js';
import { registerTemplatesModule } from './modules/workout-templates/templates.module.js';
import { registerClientWorkoutsModule } from './modules/client-workouts/client-workouts.module.js';
import { registerSessionsModule } from './modules/sessions/sessions.module.js';
import { registerPackagesModule } from './modules/packages/packages.module.js';
import { registerAccountingModule } from './modules/accounting/accounting.module.js';

export type AppDeps = { db: Db; cookieSecret: string; isProd: boolean };

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);

  await app.register(helmet);
  await app.register(cookie, { secret: deps.cookieSecret });

  // Общий провайдер newId/now для auth и доменных модулей (детерминизм в тестах).
  const clock = realClock;

  const repo = makeAuthRepo(deps.db);
  const svc = makeAuthService(repo, clock);

  await app.register(tenantContext, { findSession: (id) => repo.findSession(id) });

  // Жёсткий лимит на auth-роуты против перебора.
  await app.register(async (authScope) => {
    await authScope.register(rateLimit, { max: 20, timeWindow: '1 minute' });
    authRoutes(authScope, svc, deps.isProd);
  });

  registerClientsModule(app, { db: deps.db, clock });
  registerExercisesModule(app, { db: deps.db, clock });
  registerTemplatesModule(app, { db: deps.db, clock });
  registerClientWorkoutsModule(app, { db: deps.db, clock });
  registerSessionsModule(app, { db: deps.db, clock });
  registerPackagesModule(app, { db: deps.db, clock });
  registerAccountingModule(app, { db: deps.db, clock });

  healthRoutes(app);
  return app;
}
