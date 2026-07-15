import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { appInfoResponseSchema, type AppInfoResponse } from '@trener/shared';

/**
 * Публичный (без авторизации) эндпойнт для server-driven принудительного обновления.
 * Оба мобильных приложения при запуске сравнивают свой номер сборки с minBuild и,
 * если он ниже, показывают неигнорируемый диалог «Требуется обновление».
 * minBuild читается из env; 0 (по умолчанию) — обновление не требуется.
 */
export function appInfoRoutes(app: FastifyInstance): void {
  app
    .withTypeProvider<ZodTypeProvider>()
    .get('/api/app-info', { schema: { response: { 200: appInfoResponseSchema } } }, () => {
      const response: AppInfoResponse = {
        trainer: {
          minBuild: parseInt(process.env.APP_MIN_BUILD_TRAINER ?? '', 10) || 0,
          android: 'https://play.google.com/store/apps/details?id=ru.fitbond.trener_trainer',
          ios: 'https://apps.apple.com/app/id6782923177',
        },
        client: {
          minBuild: parseInt(process.env.APP_MIN_BUILD_CLIENT ?? '', 10) || 0,
          android: 'https://play.google.com/store/apps/details?id=ru.fitbond.trener_client',
          ios: 'https://apps.apple.com/app/id6782938590',
        },
      };
      return response;
    });
}
