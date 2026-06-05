import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  pushSubscribeRequestSchema,
  pushUnsubscribeRequestSchema,
  pushVapidResponseSchema,
} from '@trener/shared';
import type { PushService } from './push.service.js';
import { requireClient } from '../../plugins/client-context.js';
import { unauthorized } from '../../errors.js';

const okSchema = z.object({ ok: z.literal(true) });

// HTTP-слой push: только клиентские роуты (подписка привязана к client_accounts.id).
// Scope тренер↔клиент не нужен — пуш адресуется аккаунту, не данным тренера.
export function pushRoutes(app: FastifyInstance, svc: PushService): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  function accountId(req: { clientAccountId?: string }): string {
    if (!req.clientAccountId) throw unauthorized('Требуется вход');
    return req.clientAccountId;
  }

  // Публичный VAPID-ключ для PushManager.subscribe() на фронте. '' => push выключен.
  typed.get(
    '/api/client/push/vapid',
    { preHandler: requireClient, schema: { response: { 200: pushVapidResponseSchema } } },
    () => ({ publicKey: svc.publicKey }),
  );

  typed.post(
    '/api/client/push/subscribe',
    {
      preHandler: requireClient,
      schema: { body: pushSubscribeRequestSchema, response: { 200: okSchema } },
    },
    async (req) => {
      await svc.subscribe(accountId(req), req.body.subscription);
      return { ok: true as const };
    },
  );

  typed.post(
    '/api/client/push/unsubscribe',
    {
      preHandler: requireClient,
      schema: { body: pushUnsubscribeRequestSchema, response: { 200: okSchema } },
    },
    async (req) => {
      await svc.unsubscribe(req.body.endpoint);
      return { ok: true as const };
    },
  );
}
