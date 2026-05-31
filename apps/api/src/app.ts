import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { randomUUID } from 'node:crypto';
import type { Db } from './db/client.js';
import { errorHandler } from './plugins/error-handler.js';
import { tenantContext } from './plugins/tenant-context.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { makeAuthRepo } from './modules/auth/auth.repo.js';
import { makeAuthService } from './modules/auth/auth.service.js';
import { authRoutes } from './modules/auth/auth.routes.js';

export type AppDeps = { db: Db; cookieSecret: string; isProd: boolean };

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);

  await app.register(helmet);
  await app.register(cookie, { secret: deps.cookieSecret });

  const repo = makeAuthRepo(deps.db);
  const svc = makeAuthService(repo, { newId: () => randomUUID(), now: () => new Date() });

  await app.register(tenantContext, { findSession: (id) => repo.findSession(id) });

  // Жёсткий лимит на auth-роуты против перебора.
  await app.register(async (authScope) => {
    await authScope.register(rateLimit, { max: 20, timeWindow: '1 minute' });
    authRoutes(authScope, svc, deps.isProd);
  });

  healthRoutes(app);
  return app;
}
