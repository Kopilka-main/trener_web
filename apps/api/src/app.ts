import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { Db } from './db/client.js';
import { realClock } from './core/app-deps.js';
import { errorHandler } from './plugins/error-handler.js';
import { tenantContext } from './plugins/tenant-context.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { makeAuthRepo } from './modules/auth/auth.repo.js';
import { makeFilesRepo } from './modules/files/files.repo.js';
import { makeAuthService } from './modules/auth/auth.service.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { registerClientAuthModule } from './modules/client-auth/client-auth.module.js';
import { registerClientAppWorkoutsModule } from './modules/client-app-workouts/client-app-workouts.module.js';
import { registerClientAppChatModule } from './modules/client-app-chat/client-app-chat.module.js';
import { registerClientAppTrainerModule } from './modules/client-app-trainer/client-app-trainer.module.js';
import { registerClientAppCalendarModule } from './modules/client-app-calendar/client-app-calendar.module.js';
import { registerClientAppMeasurementsModule } from './modules/client-app-measurements/client-app-measurements.module.js';
import { registerClientAppExercisesModule } from './modules/client-app-exercises/client-app-exercises.module.js';
import { registerClientAppPackagesModule } from './modules/client-app-packages/client-app-packages.module.js';
import { registerClientsModule } from './modules/clients/clients.module.js';
import { registerExercisesModule } from './modules/exercises/exercises.module.js';
import { registerTemplatesModule } from './modules/workout-templates/templates.module.js';
import { registerClientWorkoutsModule } from './modules/client-workouts/client-workouts.module.js';
import { registerSessionsModule } from './modules/sessions/sessions.module.js';
import { registerPackagesModule } from './modules/packages/packages.module.js';
import { registerAccountingModule } from './modules/accounting/accounting.module.js';
import { registerMeasurementsModule } from './modules/measurements/measurements.module.js';
import { registerChatModule } from './modules/chat/chat.module.js';
import { registerFilesModule } from './modules/files/files.module.js';
import { registerProgressPhotosModule } from './modules/progress-photos/progress-photos.module.js';
import { registerMedicalModule } from './modules/medical-records/medical.module.js';
import { makeStorage } from './files/storage.js';

// uploadsDir опционален: в проде передаётся из env.UPLOADS_DIR (server.ts).
// В тестах опускается — тогда создаётся изолированный временный каталог,
// чтобы не ломать существующие вызовы buildApp({db, cookieSecret, isProd}).
export type AppDeps = { db: Db; cookieSecret: string; isProd: boolean; uploadsDir?: string };

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);

  await app.register(helmet);
  await app.register(cookie, { secret: deps.cookieSecret });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });

  const uploadsDir = deps.uploadsDir ?? mkdtempSync(path.join(tmpdir(), 'trener-uploads-'));
  const storage = makeStorage(uploadsDir);

  // Общий провайдер newId/now для auth и доменных модулей (детерминизм в тестах).
  const clock = realClock;

  // Общий files-repo: используется auth/client-auth/client-app-trainer для аватаров
  // (раздача + чистка прежних файлов), а также модулем files.
  const filesRepo = makeFilesRepo(deps.db);

  const repo = makeAuthRepo(deps.db);
  const svc = makeAuthService(repo, filesRepo, storage, clock);

  await app.register(tenantContext, { findSession: (id) => repo.findSession(id) });

  // Жёсткий лимит на auth-роуты против перебора.
  await app.register(async (authScope) => {
    await authScope.register(rateLimit, { max: 20, timeWindow: '1 minute' });
    authRoutes(authScope, svc, deps.isProd);
  });

  const clientAuthSvc = await registerClientAuthModule(app, {
    db: deps.db,
    clock,
    isProd: deps.isProd,
    filesRepo,
    storage,
  });
  registerClientAppWorkoutsModule(app, {
    db: deps.db,
    clock,
    resolveScope: (id) => clientAuthSvc.resolveScope(id),
  });
  registerClientAppChatModule(app, {
    db: deps.db,
    clock,
    resolveScope: (id) => clientAuthSvc.resolveScope(id),
  });
  registerClientAppTrainerModule(app, {
    db: deps.db,
    filesRepo,
    storage,
    resolveScope: (id) => clientAuthSvc.resolveScope(id),
  });
  registerClientAppCalendarModule(app, {
    db: deps.db,
    clock,
    resolveScope: (id) => clientAuthSvc.resolveScope(id),
  });
  registerClientAppMeasurementsModule(app, {
    db: deps.db,
    clock,
    resolveScope: (id) => clientAuthSvc.resolveScope(id),
  });
  registerClientAppExercisesModule(app, {
    db: deps.db,
    clock,
    resolveScope: (id) => clientAuthSvc.resolveScope(id),
  });
  registerClientAppPackagesModule(app, {
    db: deps.db,
    clock,
    resolveScope: (id) => clientAuthSvc.resolveScope(id),
  });

  registerClientsModule(app, { db: deps.db, storage, clock });
  registerExercisesModule(app, { db: deps.db, clock });
  registerTemplatesModule(app, { db: deps.db, clock });
  registerClientWorkoutsModule(app, { db: deps.db, clock });
  registerSessionsModule(app, { db: deps.db, clock });
  registerPackagesModule(app, { db: deps.db, clock });
  registerAccountingModule(app, { db: deps.db, clock });
  registerMeasurementsModule(app, { db: deps.db, clock });
  registerChatModule(app, { db: deps.db, clock });
  registerFilesModule(app, { db: deps.db, storage });
  registerProgressPhotosModule(app, { db: deps.db, storage, clock });
  registerMedicalModule(app, { db: deps.db, storage, clock });

  healthRoutes(app);
  return app;
}
