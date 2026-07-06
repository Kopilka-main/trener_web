import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ClientLink } from '@trener/shared';
import { submitSupportRequestSchema, submitSupportResponseSchema } from '@trener/shared';
import type { SupportService } from './support.service.js';
import { requireAuth } from '../../plugins/tenant-context.js';
import { requireClient } from '../../plugins/client-context.js';
import { unauthorized } from '../../errors.js';

// Структурный контакт отправителя (email/имя) — НЕ импортируем из repo (граница слоёв
// routes↔repo). Резолверы приходят из модуля закрытием над repo (как requireClientAccess).
type SupportContact = { email: string; firstName: string; lastName: string };
type ContactResolver = (id: string) => Promise<SupportContact | null>;
type ResolveScope = (clientAccountId: string) => Promise<ClientLink>;

function fullName(c: SupportContact | null): string | null {
  if (!c) return null;
  const name = `${c.firstName} ${c.lastName}`.trim();
  return name || null;
}

// Тренерский роут поддержки: POST /api/support (auth тренера, cookie sid → req.trainerId).
export function supportTrainerRoutes(
  app: FastifyInstance,
  svc: SupportService,
  resolveTrainerContact: ContactResolver,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/api/support',
    {
      preHandler: requireAuth,
      schema: {
        body: submitSupportRequestSchema,
        response: { 200: submitSupportResponseSchema },
      },
    },
    async (req) => {
      if (!req.trainerId) throw unauthorized('Требуется вход');
      const contact = await resolveTrainerContact(req.trainerId);
      await svc.submit({
        source: 'trainer',
        trainerId: req.trainerId,
        email: contact?.email ?? null,
        name: fullName(contact),
        text: req.body.text,
      });
      return { ok: true };
    },
  );
}

// Клиентский роут поддержки: POST /api/client-app/support (auth клиента). Привязка к
// тренеру для поддержки необязательна — неподключённый клиент тоже может писать (trainerId
// в записи остаётся null).
export function supportClientRoutes(
  app: FastifyInstance,
  svc: SupportService,
  resolveScope: ResolveScope,
  resolveClientContact: ContactResolver,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/api/client-app/support',
    {
      preHandler: requireClient,
      schema: {
        body: submitSupportRequestSchema,
        response: { 200: submitSupportResponseSchema },
      },
    },
    async (req) => {
      if (!req.clientAccountId) throw unauthorized('Требуется вход');
      const link = await resolveScope(req.clientAccountId);
      const contact = await resolveClientContact(req.clientAccountId);
      await svc.submit({
        source: 'client',
        clientAccountId: req.clientAccountId,
        trainerId: link?.trainerId ?? null,
        email: contact?.email ?? null,
        name: fullName(contact),
        text: req.body.text,
      });
      return { ok: true };
    },
  );
}
