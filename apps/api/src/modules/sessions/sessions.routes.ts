import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createSessionRequestSchema,
  updateSessionRequestSchema,
  sessionResponseSchema,
  sessionListResponseSchema,
} from '@trener/shared';
import type { SessionsService } from './sessions.service.js';
import { requireAuth } from '../../plugins/tenant-context.js';
import { unauthorized } from '../../errors.js';

const idParams = z.object({ id: z.string() });
const sessionWrap = z.object({ session: sessionResponseSchema });

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
// Диапазон дат для фильтра календаря: оба поля опциональны (YYYY-MM-DD).
const listQuery = z.object({
  from: dateStr.optional(),
  to: dateStr.optional(),
});

// HTTP-слой sessions: только роуты. Сборка repo/service — в sessions.module.ts
// (граница слоёв: *.routes.ts не импортирует *.repo/**/db).
// Календарь занятий тренера, НЕ вложен под клиента → только requireAuth; clientId в теле.
export function sessionsRoutes(app: FastifyInstance, svc: SessionsService): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  function trainerId(req: { trainerId?: string }): string {
    if (!req.trainerId) throw unauthorized('Требуется вход');
    return req.trainerId;
  }

  typed.get(
    '/api/sessions',
    {
      preHandler: requireAuth,
      schema: { querystring: listQuery, response: { 200: sessionListResponseSchema } },
    },
    async (req) => {
      // exactOptionalPropertyTypes: передаём только определённые границы диапазона.
      const range: { from?: string; to?: string } = {};
      if (req.query.from !== undefined) range.from = req.query.from;
      if (req.query.to !== undefined) range.to = req.query.to;
      return { sessions: await svc.list(trainerId(req), range) };
    },
  );

  typed.get(
    '/api/sessions/:id',
    {
      preHandler: requireAuth,
      schema: { params: idParams, response: { 200: sessionWrap } },
    },
    async (req) => ({ session: await svc.get(trainerId(req), req.params.id) }),
  );

  typed.post(
    '/api/sessions',
    {
      preHandler: requireAuth,
      schema: { body: createSessionRequestSchema, response: { 201: sessionWrap } },
    },
    async (req, reply) => {
      const session = await svc.create(trainerId(req), req.body);
      void reply.status(201);
      return { session };
    },
  );

  typed.patch(
    '/api/sessions/:id',
    {
      preHandler: requireAuth,
      schema: {
        params: idParams,
        body: updateSessionRequestSchema,
        response: { 200: sessionWrap },
      },
    },
    async (req) => ({ session: await svc.update(trainerId(req), req.params.id, req.body) }),
  );

  typed.delete(
    '/api/sessions/:id',
    {
      preHandler: requireAuth,
      schema: { params: idParams, response: { 200: z.object({ ok: z.literal(true) }) } },
    },
    async (req) => {
      await svc.remove(trainerId(req), req.params.id);
      return { ok: true as const };
    },
  );
}
