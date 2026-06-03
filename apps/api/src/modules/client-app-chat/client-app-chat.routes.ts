import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  sendMessageRequestSchema,
  messageResponseSchema,
  messageListResponseSchema,
  type ClientLink,
} from '@trener/shared';
import type { ChatService } from '../chat/chat.service.js';
import { requireClient } from '../../plugins/client-context.js';
import { AppError, unauthorized } from '../../errors.js';

type ResolveScope = (clientAccountId: string) => Promise<ClientLink>;

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

  async function scope(req: FastifyRequest): Promise<{ trainerId: string; clientId: string }> {
    if (!req.clientAccountId) throw unauthorized('Требуется вход');
    const link = await resolveScope(req.clientAccountId);
    if (!link) throw new AppError(409, 'NOT_LINKED', 'Аккаунт не подключён к тренеру');
    return link;
  }

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
