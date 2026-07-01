// OAuth-контракты модуля. Валидация входа роутов — локальными Zod-схемами (внешний
// публичный флоу, контракта в @trener/shared нет). Провайдеры и контуры — литеральные
// объединения, чтобы TS сузил ветвление в сервисе.
import { z } from 'zod';

export const OAUTH_PROVIDERS = ['vk', 'yandex'] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export const OAUTH_APPS = ['trainer', 'client'] as const;
export type OAuthApp = (typeof OAUTH_APPS)[number];

// GET /api/auth/oauth/:provider — параметры пути и query.
export const oauthStartParamsSchema = z.object({
  provider: z.enum(OAUTH_PROVIDERS),
});
export const oauthStartQuerySchema = z.object({
  app: z.enum(OAUTH_APPS).default('trainer'),
});

// GET /api/auth/oauth/:provider/callback — провайдер в пути, code/state/device_id в query.
export const oauthCallbackParamsSchema = z.object({
  provider: z.enum(OAUTH_PROVIDERS),
});
export const oauthCallbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  device_id: z.string().optional(),
  error: z.string().optional(),
});
