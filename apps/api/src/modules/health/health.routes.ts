import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { healthResponseSchema } from '@trener/shared';

/// Пробы для оркестратора и деплоя. Разделены намеренно:
///   • `/api/health`       — liveness: процесс жив. В БД НЕ ходит, иначе при
///     недоступной базе docker бесконечно перезапускал бы живой контейнер.
///   • `/api/health/ready` — readiness: сервис реально может обслуживать запросы
///     (проверяем БД). Её опрашивает деплой, прежде чем счесть выкладку удачной.
/// [ping] не задан (юнит-тесты без БД) → readiness ведёт себя как liveness.
export function healthRoutes(app: FastifyInstance, ping?: () => Promise<void>): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get('/api/health', { schema: { response: { 200: healthResponseSchema } } }, () => ({
    ok: true as const,
    ts: new Date().toISOString(),
  }));

  typed.get('/api/health/ready', async (_req, reply) => {
    if (ping) {
      try {
        await ping();
      } catch (err) {
        // Тело без деталей: проба публичная, наружу не отдаём внутренности БД.
        app.log.error({ err }, 'readiness: БД недоступна');
        return reply.status(503).send({ ok: false, ts: new Date().toISOString() });
      }
    }
    return reply.status(200).send({ ok: true, ts: new Date().toISOString() });
  });
}
