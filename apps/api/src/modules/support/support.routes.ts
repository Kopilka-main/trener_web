import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { ClientLink } from '@trener/shared';
import {
  submitSupportRequestSchema,
  submitSupportResponseSchema,
  supportThreadResponseSchema,
} from '@trener/shared';
import type { SupportService, SupportThreadItem } from './support.service.js';
import { requireAuth } from '../../plugins/tenant-context.js';
import { requireClient } from '../../plugins/client-context.js';
import { AppError, unauthorized } from '../../errors.js';

// Разобранное вложение из multipart-запроса поддержки.
type ParsedAttachment = {
  kind: 'image' | 'file';
  file: Buffer;
  mime: string;
  filename: string;
  caption?: string;
};

const captionSchema = z.string().trim().max(1000);

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

// Сериализация ленты переписки под supportThreadResponseSchema (createdAt → ISO-строка).
function toThreadResponse(items: SupportThreadItem[]): {
  messages: {
    id: string;
    direction: 'in' | 'out';
    text: string;
    createdAt: string;
    attachment: { fileId: string; kind: 'image' | 'file'; name: string } | null;
  }[];
} {
  return {
    messages: items.map((m) => ({
      id: m.id,
      direction: m.direction,
      text: m.text,
      createdAt: m.createdAt.toISOString(),
      attachment: m.attachment
        ? { fileId: m.attachment.fileId, kind: m.attachment.kind, name: m.attachment.name }
        : null,
    })),
  };
}

// Читает multipart-запрос вложения: файл `file` в буфер + поля kind/caption.
async function readAttachment(req: FastifyRequest): Promise<ParsedAttachment> {
  let file: Buffer | null = null;
  let mime: string | null = null;
  let filename = 'attachment';
  const fields: Record<string, string> = {};

  for await (const part of req.parts()) {
    if (part.type === 'file') {
      if (part.fieldname === 'file' && file === null) {
        file = await part.toBuffer();
        mime = part.mimetype;
        filename = part.filename || filename;
      } else {
        // Прочие файловые части дренируем, чтобы не блокировать поток.
        await part.toBuffer();
      }
    } else if (typeof part.value === 'string') {
      fields[part.fieldname] = part.value;
    }
  }

  if (!file || mime === null) {
    throw new AppError(400, 'FILE_REQUIRED', 'Файл `file` обязателен');
  }
  if (fields.kind !== 'image' && fields.kind !== 'file') {
    throw new AppError(400, 'VALIDATION', 'Некорректный вид вложения (kind)');
  }

  let caption: string | undefined;
  if (fields.caption !== undefined && fields.caption !== '') {
    const parsed = captionSchema.safeParse(fields.caption);
    if (!parsed.success) throw new AppError(400, 'VALIDATION', 'Некорректная подпись (caption)');
    caption = parsed.data;
  }

  return { kind: fields.kind, file, mime, filename, ...(caption ? { caption } : {}) };
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

  // Вложение (картинка/файл) в обращение тренера: multipart (файл `file` + kind/caption).
  typed.post(
    '/api/support/attachment',
    {
      preHandler: requireAuth,
      schema: { response: { 200: submitSupportResponseSchema } },
    },
    async (req) => {
      if (!req.trainerId) throw unauthorized('Требуется вход');
      const contact = await resolveTrainerContact(req.trainerId);
      const parsed = await readAttachment(req);
      await svc.submitAttachment({
        source: 'trainer',
        trainerId: req.trainerId,
        email: contact?.email ?? null,
        name: fullName(contact),
        kind: parsed.kind,
        file: parsed.file,
        mime: parsed.mime,
        filename: parsed.filename,
        ...(parsed.caption ? { caption: parsed.caption } : {}),
      });
      return { ok: true };
    },
  );

  // Переписка тренера с поддержкой (обращения + ответы саппорта), ASC по времени.
  typed.get(
    '/api/support/thread',
    { preHandler: requireAuth, schema: { response: { 200: supportThreadResponseSchema } } },
    async (req) => {
      if (!req.trainerId) throw unauthorized('Требуется вход');
      return toThreadResponse(await svc.threadForTrainer(req.trainerId));
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

  // Переписка клиента с поддержкой. Скоуплено по clientAccountId (как и запись обращения) —
  // работает и для неподключённого клиента, поэтому resolveScope (который 409-ит без
  // привязки) к чтению НЕ применяем.
  typed.get(
    '/api/client-app/support/thread',
    { preHandler: requireClient, schema: { response: { 200: supportThreadResponseSchema } } },
    async (req) => {
      if (!req.clientAccountId) throw unauthorized('Требуется вход');
      return toThreadResponse(await svc.threadForClient(req.clientAccountId));
    },
  );
}
