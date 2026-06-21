import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  sendMessageRequestSchema,
  messageResponseSchema,
  trainerChatMessagesResponseSchema,
  conversationListResponseSchema,
} from '@trener/shared';
import type { ChatService } from './chat.service.js';
import { requireAuth } from '../../plugins/tenant-context.js';
import type { makeRequireClientAccess } from '../../plugins/require-client-access.js';
import { unauthorized } from '../../errors.js';

// guard связи тренер↔клиент — импортируем тип из плагина (не repo/db),
// чтобы HTTP-слой не нарушал границу *.routes.ts ↔ *.repo/**/db.
type RequireClientAccess = ReturnType<typeof makeRequireClientAccess>;

const clientParams = z.object({ id: z.string() });
const listMessagesQuery = z.object({ sinceId: z.string().optional() });
const messageWrap = z.object({ message: messageResponseSchema });

// HTTP-слой chat: список диалогов тренера верхнеуровневый (только requireAuth);
// сообщения вложены под клиента ([requireAuth, requireClientAccess]).
// Сборка repo/service/guard — в chat.module.ts (граница слоёв).
export function chatRoutes(
  app: FastifyInstance,
  svc: ChatService,
  requireClientAccess: RequireClientAccess,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const clientPreHandler = [requireAuth, requireClientAccess];

  function trainerId(req: { trainerId?: string }): string {
    if (!req.trainerId) throw unauthorized('Требуется вход');
    return req.trainerId;
  }

  typed.get(
    '/api/conversations',
    {
      preHandler: requireAuth,
      schema: { response: { 200: conversationListResponseSchema } },
    },
    async (req) => ({ conversations: await svc.listConversations(trainerId(req)) }),
  );

  // Удаление диалога по клиенту — тренер-скоуп (без проверки активной связи),
  // чтобы можно было снести и «осиротевшие» диалоги (клиент отвязан/пересоздан).
  typed.delete(
    '/api/conversations/:clientId',
    {
      preHandler: requireAuth,
      schema: {
        params: z.object({ clientId: z.string() }),
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (req) => {
      await svc.deleteConversation(trainerId(req), req.params.clientId);
      return { ok: true as const };
    },
  );

  typed.get(
    '/api/chat/unread',
    {
      preHandler: requireAuth,
      schema: { response: { 200: z.object({ count: z.number() }) } },
    },
    async (req) => ({ count: await svc.trainerUnread(trainerId(req)) }),
  );

  typed.get(
    '/api/clients/:id/messages',
    {
      preHandler: clientPreHandler,
      schema: {
        params: clientParams,
        querystring: listMessagesQuery,
        response: { 200: trainerChatMessagesResponseSchema },
      },
    },
    async (req) => {
      // exactOptionalPropertyTypes: передаём sinceId только когда задан.
      const options: { sinceId?: string } = {};
      if (req.query.sinceId !== undefined) options.sinceId = req.query.sinceId;
      const t = trainerId(req);
      const [messages, clientLastReadAt, pinnedMessages] = await Promise.all([
        svc.listMessages(t, req.params.id, options),
        svc.clientReadAt(t, req.params.id),
        svc.getPinned(t, req.params.id),
      ]);
      return { messages, clientLastReadAt, pinnedMessages };
    },
  );

  // Закрепить конкретное сообщение (тренер).
  typed.post(
    '/api/clients/:id/messages/:messageId/pin',
    {
      preHandler: clientPreHandler,
      schema: {
        params: z.object({ id: z.string(), messageId: z.string() }),
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (req) => {
      await svc.pin(trainerId(req), req.params.id, req.params.messageId);
      return { ok: true as const };
    },
  );

  // Снять закреп с конкретного сообщения (тренер).
  typed.delete(
    '/api/clients/:id/messages/:messageId/pin',
    {
      preHandler: clientPreHandler,
      schema: {
        params: z.object({ id: z.string(), messageId: z.string() }),
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (req) => {
      await svc.unpin(trainerId(req), req.params.id, req.params.messageId);
      return { ok: true as const };
    },
  );

  // Удалить одно сообщение диалога (тренер).
  typed.delete(
    '/api/clients/:id/messages/:messageId',
    {
      preHandler: clientPreHandler,
      schema: {
        params: z.object({ id: z.string(), messageId: z.string() }),
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    async (req) => {
      await svc.deleteMessage(trainerId(req), req.params.id, req.params.messageId);
      return { ok: true as const };
    },
  );

  typed.post(
    '/api/clients/:id/messages',
    {
      preHandler: clientPreHandler,
      schema: {
        params: clientParams,
        body: sendMessageRequestSchema,
        response: { 201: messageWrap },
      },
    },
    async (req, reply) => {
      const message = await svc.sendMessage(trainerId(req), req.params.id, req.body);
      void reply.status(201);
      return { message };
    },
  );

  typed.delete(
    '/api/clients/:id/messages',
    {
      preHandler: clientPreHandler,
      schema: { params: clientParams, response: { 200: z.object({ ok: z.literal(true) }) } },
    },
    async (req) => {
      await svc.deleteConversation(trainerId(req), req.params.id);
      return { ok: true as const };
    },
  );

  typed.post(
    '/api/clients/:id/messages/read',
    {
      preHandler: clientPreHandler,
      schema: { params: clientParams, response: { 200: z.object({ ok: z.literal(true) }) } },
    },
    async (req) => {
      await svc.markRead(trainerId(req), req.params.id);
      return { ok: true as const };
    },
  );
}
