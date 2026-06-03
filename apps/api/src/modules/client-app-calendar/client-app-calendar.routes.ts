import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  sessionListResponseSchema,
  sessionResponseSchema,
  clientSessionConfirmRequestSchema,
} from '@trener/shared';
import type { SessionsService } from '../sessions/sessions.service.js';
import { requireClient } from '../../plugins/client-context.js';
import { makeClientScope, type ResolveScope } from '../../core/client-scope.js';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const listQuery = z.object({ from: dateStr.optional(), to: dateStr.optional() });
const idParams = z.object({ id: z.string().min(1) });
const sessionWrap = z.object({ session: sessionResponseSchema });

export function clientAppCalendarRoutes(
  app: FastifyInstance,
  svc: SessionsService,
  resolveScope: ResolveScope,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const scope = makeClientScope(resolveScope);

  typed.get(
    '/api/client/sessions',
    {
      preHandler: requireClient,
      schema: { querystring: listQuery, response: { 200: sessionListResponseSchema } },
    },
    async (req) => {
      const { trainerId, clientId } = await scope(req);
      const range: { from?: string; to?: string } = {};
      if (req.query.from !== undefined) range.from = req.query.from;
      if (req.query.to !== undefined) range.to = req.query.to;
      return { sessions: await svc.listForClient(trainerId, clientId, range) };
    },
  );

  typed.post(
    '/api/client/sessions/:id/confirmation',
    {
      preHandler: requireClient,
      schema: {
        params: idParams,
        body: clientSessionConfirmRequestSchema,
        response: { 200: sessionWrap },
      },
    },
    async (req) => {
      const { trainerId, clientId } = await scope(req);
      const session = await svc.setClientConfirmation(
        trainerId,
        clientId,
        req.params.id,
        req.body.status,
      );
      return { session };
    },
  );
}
