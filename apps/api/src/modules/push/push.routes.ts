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
import { requireAuth } from '../../plugins/tenant-context.js';
import { unauthorized } from '../../errors.js';

const okSchema = z.object({ ok: z.literal(true) });

// Клиентские роуты push: подписка привязана к client_accounts.id (req.clientAccountId).
export function clientPushRoutes(app: FastifyInstance, svc: PushService): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  function accountId(req: { clientAccountId?: string }): string {
    if (!req.clientAccountId) throw unauthorized('Требуется вход');
    return req.clientAccountId;
  }

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
      await svc.subscribe({ clientAccountId: accountId(req) }, req.body.subscription);
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

// Тренерские роуты push: подписка привязана к trainers.id (req.trainerId).
export function trainerPushRoutes(app: FastifyInstance, svc: PushService): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  function trainerId(req: { trainerId?: string }): string {
    if (!req.trainerId) throw unauthorized('Требуется вход');
    return req.trainerId;
  }

  typed.get(
    '/api/push/vapid',
    { preHandler: requireAuth, schema: { response: { 200: pushVapidResponseSchema } } },
    () => ({ publicKey: svc.publicKey }),
  );

  typed.post(
    '/api/push/subscribe',
    {
      preHandler: requireAuth,
      schema: { body: pushSubscribeRequestSchema, response: { 200: okSchema } },
    },
    async (req) => {
      await svc.subscribe({ trainerId: trainerId(req) }, req.body.subscription);
      return { ok: true as const };
    },
  );

  typed.post(
    '/api/push/unsubscribe',
    {
      preHandler: requireAuth,
      schema: { body: pushUnsubscribeRequestSchema, response: { 200: okSchema } },
    },
    async (req) => {
      await svc.unsubscribe(req.body.endpoint);
      return { ok: true as const };
    },
  );
}
