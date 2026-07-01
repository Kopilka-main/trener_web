import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { Clock } from '../../core/app-deps.js';
import { makeOAuthRepo } from './oauth.repo.js';
import { makeOAuthService, type ProviderConfig } from './oauth.service.js';
import { realOAuthHttp, type OAuthHttp } from './oauth.http.js';
import { oauthRoutes } from './oauth.routes.js';

export function registerOAuthModule(
  app: FastifyInstance,
  deps: {
    db: Db;
    clock: Clock;
    redirectBase: string;
    vk: ProviderConfig;
    yandex: ProviderConfig;
    // Колбэки создания сессий контуров (тонкие обёртки auth/client-auth сервисов).
    createTrainerSession: (trainerId: string) => Promise<{ token: string }>;
    createClientSession: (clientAccountId: string) => Promise<{ token: string }>;
    // Инъекция HTTP-клиента (тесты подменяют; прод — realOAuthHttp).
    http?: OAuthHttp;
  },
): void {
  const repo = makeOAuthRepo(deps.db, deps.clock.newId, deps.clock.now);
  const svc = makeOAuthService({
    repo,
    http: deps.http ?? realOAuthHttp,
    redirectBase: deps.redirectBase,
    vk: deps.vk,
    yandex: deps.yandex,
    createTrainerSession: deps.createTrainerSession,
    createClientSession: deps.createClientSession,
  });

  oauthRoutes(app, svc, deps.redirectBase);
}
