import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  sendMessageRequestSchema,
  messageResponseSchema,
  messageListResponseSchema,
} from '@trener/shared';
import type { ChatService } from '../chat/chat.service.js';
import { requireClient } from '../../plugins/client-context.js';
import { makeClientScope, type ResolveScope } from '../../core/client-scope.js';

const messageWrap = z.object({ message: messageResponseSchema });
const unreadResponse = z.object({ count: z.number() });
const okResponse = z.object({ ok: z.literal(true) });
const messagesQuery = z.object({ sinceId: z.string().optional() });

export function clientAppChatRoutes(
  app: FastifyInstance,
  svc: ChatService,
  resolveScope: ResolveScope,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const scope = makeClientScope(resolveScope);

  typed.get(
    '/api/client/chat/messages',
    {
      preHandler: requireClient,
      schema: { querystring: messagesQuery, response: { 200: messageListResponseSchema } },
    },
    async (req) => {
      const { trainerId, clientId } = await scope(req);
      const options = req.query.sinceId !== undefined ? { sinceId: req.query.sinceId } : {};
      return { messages: await svc.listMessages(trainerId, clientId, options) };
    },
  );

  typed.post(
    '/api/client/chat/messages',
    {
      preHandler: requireClient,
      schema: { body: sendMessageRequestSchema, response: { 200: messageWrap } },
    },
    async (req) => {
      const { trainerId, clientId } = await scope(req);
      return { message: await svc.sendMessage(trainerId, clientId, req.body, 'client') };
    },
  );

  typed.post(
    '/api/client/chat/read',
    { preHandler: requireClient, schema: { response: { 200: okResponse } } },
    async (req) => {
      const { trainerId, clientId } = await scope(req);
      await svc.markReadByClient(trainerId, clientId);
      return { ok: true as const };
    },
  );

  typed.get(
    '/api/client/chat/unread',
    { preHandler: requireClient, schema: { response: { 200: unreadResponse } } },
    async (req) => {
      const { trainerId, clientId } = await scope(req);
      return { count: await svc.clientUnread(trainerId, clientId) };
    },
  );
}
