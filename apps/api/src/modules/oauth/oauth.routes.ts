import type { FastifyInstance } from 'fastify';
import type { OAuthService } from './oauth.service.js';
import {
  oauthStartParamsSchema,
  oauthStartQuerySchema,
  oauthCallbackParamsSchema,
  oauthCallbackQuerySchema,
} from './oauth.schema.js';

// Публичные OAuth-роуты (БЕЗ requireAuth). Валидацию входа делаем вручную (Zod safeParse),
// т.к. ответы — 302-редиректы, а не JSON: type-provider тут не нужен и мешал бы схемам ответа.
export function oauthRoutes(app: FastifyInstance, svc: OAuthService, redirectBase: string): void {
  // Финальный URL, который перехватывает мобильный webview: токен или ошибка в query.
  function doneUrl(params: Record<string, string>): string {
    const qs = new URLSearchParams(params).toString();
    return `${redirectBase}/api/auth/oauth/done?${qs}`;
  }

  // Старт: 302 на URL провайдера. Невалидный провайдер → 400.
  app.get('/api/auth/oauth/:provider', async (req, reply) => {
    const params = oauthStartParamsSchema.safeParse(req.params);
    if (!params.success) {
      return reply.status(400).send({ code: 'BAD_PROVIDER', message: 'Неизвестный провайдер' });
    }
    const query = oauthStartQuerySchema.safeParse(req.query);
    const appScope = query.success ? query.data.app : 'trainer';
    const url = await svc.getAuthUrl(params.data.provider, appScope);
    return reply.redirect(url, 302);
  });

  // Коллбэк: обмениваем code на сессию, 302 на done?token=… При ошибке — done?error=…
  app.get('/api/auth/oauth/:provider/callback', async (req, reply) => {
    const params = oauthCallbackParamsSchema.safeParse(req.params);
    if (!params.success) {
      return reply.redirect(doneUrl({ error: 'bad_provider' }), 302);
    }
    const query = oauthCallbackQuerySchema.safeParse(req.query);
    if (!query.success) {
      return reply.redirect(doneUrl({ error: 'bad_callback' }), 302);
    }
    // Провайдер вернул ошибку авторизации (пользователь отменил и т.п.).
    if (query.data.error) {
      return reply.redirect(doneUrl({ error: query.data.error }), 302);
    }
    try {
      const { token } = await svc.handleCallback(params.data.provider, {
        code: query.data.code,
        state: query.data.state,
        deviceId: query.data.device_id,
      });
      return reply.redirect(doneUrl({ token }), 302);
    } catch (err) {
      const code =
        err instanceof Error && 'code' in err
          ? String((err as { code: unknown }).code)
          : 'oauth_failed';
      req.log.warn({ err }, 'oauth callback failed');
      return reply.redirect(doneUrl({ error: code }), 302);
    }
  });
}
