import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { calendarFeedResponseSchema } from '@trener/shared';
import type { CalendarService } from './calendar.service.js';
import { requireAuth } from '../../plugins/tenant-context.js';
import { unauthorized } from '../../errors.js';

// HTTP-слой calendar: только роуты. Сборка repo/service — в calendar.module.ts.
// Один защищённый роут (выдаёт ссылку тренеру) и один публичный (.ics по токену).
export function calendarRoutes(app: FastifyInstance, svc: CalendarService): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  function trainerId(req: { trainerId?: string }): string {
    if (!req.trainerId) throw unauthorized('Требуется вход');
    return req.trainerId;
  }

  // Секретная ссылка на .ics-фид для текущего тренера.
  typed.get(
    '/api/calendar/feed',
    {
      preHandler: requireAuth,
      schema: { response: { 200: calendarFeedResponseSchema } },
    },
    async (req) => ({ url: await svc.getFeedUrl(trainerId(req), req.host) }),
  );

  // Публичный iCalendar-фид по секретному токену. БЕЗ requireAuth и без zod-схемы
  // ответа: тело — text/calendar. Неизвестный токен → 404.
  app.get<{ Params: { token: string } }>('/api/calendar/:token.ics', async (req, reply) => {
    const ics = await svc.buildIcsForToken(req.params.token);
    if (ics === null) return reply.code(404).send('Not found');
    return reply.type('text/calendar; charset=utf-8').send(ics);
  });
}
