import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createClientRequestSchema,
  updateClientRequestSchema,
  clientResponseSchema,
  clientListResponseSchema,
  accountProfileResponseSchema,
  connectCodeCheckResponseSchema,
} from '@trener/shared';
import type { ClientsService, AvatarUploadInput } from './clients.service.js';
import { requireAuth } from '../../plugins/tenant-context.js';
import { makeRequireClientAccess } from '../../plugins/require-client-access.js';
import { AppError, unauthorized } from '../../errors.js';

// guard связи тренер↔клиент — импортируем тип из плагина (не repo/db),
// чтобы HTTP-слой не нарушал границу *.routes.ts ↔ *.repo/**/db.
type RequireClientAccess = ReturnType<typeof makeRequireClientAccess>;

const idParams = z.object({ id: z.string() });
const clientWrap = z.object({ client: clientResponseSchema });

// HTTP-слой clients: только роуты. Сборка repo/service/guard — в clients.module.ts
// (граница слоёв: *.routes.ts не импортирует *.repo/**/db).
export function clientsRoutes(
  app: FastifyInstance,
  svc: ClientsService,
  requireClientAccess: RequireClientAccess,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  function trainerId(req: { trainerId?: string }): string {
    if (!req.trainerId) throw unauthorized('Требуется вход');
    return req.trainerId;
  }

  // Читает multipart-запрос аватара: собирает файл `photo` в буфер (по образцу
  // progress-photos). Прочие файловые части дренируем, чтобы не блокировать поток.
  async function readAvatar(req: FastifyRequest): Promise<AvatarUploadInput> {
    let fileBuffer: Buffer | null = null;
    let mime: string | null = null;
    let originalName: string | null = null;

    for await (const part of req.parts()) {
      if (part.type === 'file') {
        if (part.fieldname === 'photo' && fileBuffer === null) {
          fileBuffer = await part.toBuffer();
          mime = part.mimetype;
          originalName = part.filename || null;
        } else {
          await part.toBuffer();
        }
      }
    }

    if (!fileBuffer || mime === null) {
      throw new AppError(400, 'FILE_REQUIRED', 'Файл `photo` обязателен');
    }
    if (!mime.startsWith('image/')) {
      throw new AppError(400, 'UNSUPPORTED_MEDIA_TYPE', 'Ожидается изображение');
    }
    return { fileBuffer, mime, originalName };
  }

  typed.post(
    '/api/clients',
    {
      preHandler: requireAuth,
      schema: { body: createClientRequestSchema, response: { 201: clientWrap } },
    },
    async (req, reply) => {
      const client = await svc.create(trainerId(req), req.body);
      void reply.status(201);
      return { client };
    },
  );

  typed.get(
    '/api/clients',
    { preHandler: requireAuth, schema: { response: { 200: clientListResponseSchema } } },
    async (req) => ({ clients: await svc.list(trainerId(req)) }),
  );

  // Проверка кода привязки до сохранения клиента (для диалога «Подключить»).
  // Статический сегмент connect-code/check не пересекается с параметрическим /:id.
  typed.get(
    '/api/clients/connect-code/check',
    {
      preHandler: requireAuth,
      schema: {
        querystring: z.object({ code: z.string(), excludeClientId: z.string().optional() }),
        response: { 200: connectCodeCheckResponseSchema },
      },
    },
    async (req) => svc.checkConnectCode(trainerId(req), req.query.code, req.query.excludeClientId),
  );

  // Профиль подключённого клиентского аккаунта — для кнопки «Получить данные».
  typed.get(
    '/api/clients/account-profile',
    {
      preHandler: requireAuth,
      schema: {
        querystring: z.object({ accountId: z.string().min(1) }),
        response: { 200: z.object({ profile: accountProfileResponseSchema }) },
      },
    },
    async (req) => {
      trainerId(req); // гард: только авторизованный тренер
      return { profile: await svc.getAccountProfile(req.query.accountId) };
    },
  );

  typed.get(
    '/api/clients/:id',
    {
      preHandler: [requireAuth, requireClientAccess],
      schema: { params: idParams, response: { 200: clientWrap } },
    },
    async (req) => ({ client: await svc.get(trainerId(req), req.params.id) }),
  );

  typed.patch(
    '/api/clients/:id',
    {
      preHandler: [requireAuth, requireClientAccess],
      schema: { params: idParams, body: updateClientRequestSchema, response: { 200: clientWrap } },
    },
    async (req) => ({ client: await svc.update(trainerId(req), req.params.id, req.body) }),
  );

  typed.delete(
    '/api/clients/:id',
    {
      preHandler: [requireAuth, requireClientAccess],
      schema: { params: idParams, response: { 200: z.object({ ok: z.literal(true) }) } },
    },
    async (req) => {
      await svc.unlink(trainerId(req), req.params.id);
      return { ok: true as const };
    },
  );

  // Аватар клиента: multipart (поле `photo`, image/*). Бизнес-логика — в service.
  typed.post(
    '/api/clients/:id/avatar',
    {
      preHandler: [requireAuth, requireClientAccess],
      schema: { params: idParams, response: { 200: clientWrap } },
    },
    async (req) => {
      const input = await readAvatar(req);
      const client = await svc.setAvatar(trainerId(req), req.params.id, input);
      return { client };
    },
  );

  typed.delete(
    '/api/clients/:id/avatar',
    {
      preHandler: [requireAuth, requireClientAccess],
      schema: { params: idParams, response: { 200: z.object({ ok: z.literal(true) }) } },
    },
    async (req) => {
      await svc.removeAvatar(trainerId(req), req.params.id);
      return { ok: true as const };
    },
  );
}
