import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url(),
  COOKIE_SECRET: z.string().min(32, 'COOKIE_SECRET должен быть не короче 32 символов'),
  UPLOADS_DIR: z.string().default('/data/uploads'),
  // Папка с глобальным медиа каталога упражнений (картинки/видео).
  CATALOG_MEDIA_DIR: z.string().default('/data/catalog'),
  // Web Push (VAPID). Опциональны: без них push мягко отключается.
  VAPID_PUBLIC_KEY: z.string().default(''),
  VAPID_PRIVATE_KEY: z.string().default(''),
  VAPID_SUBJECT: z.string().default('mailto:admin@fitbond.ru'),
  // OAuth (VK ID / Яндекс). Все опциональны: без client id/secret провайдер мягко
  // недоступен (getAuthUrl вернёт ошибку конфигурации). OAUTH_REDIRECT_BASE — базовый
  // публичный адрес API для redirect_uri коллбэка (без завершающего слэша).
  VK_CLIENT_ID: z.string().default(''),
  VK_CLIENT_SECRET: z.string().default(''),
  YANDEX_CLIENT_ID: z.string().default(''),
  YANDEX_CLIENT_SECRET: z.string().default(''),
  OAUTH_REDIRECT_BASE: z.string().default('https://app.fitbond.ru'),
  // SMTP для писем (коды сброса пароля). Без SMTP_HOST письма уходят в лог-заглушку.
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_FROM: z.string().default('FitBond <no-reply@fitbond.ru>'),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  return envSchema.parse(source);
}
