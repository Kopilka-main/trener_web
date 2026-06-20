import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  clientRegisterRequestSchema,
  clientLoginRequestSchema,
  clientAccountResponseSchema,
  clientMeResponseSchema,
  updateClientAccountRequestSchema,
} from '@trener/shared';
import type { ClientAuthService, ClientSession, AvatarUploadInput } from './client-auth.service.js';
import type { Storage } from '../../files/storage.js';
import { CLIENT_SESSION_COOKIE, requireClient } from '../../plugins/client-context.js';
import { bearerToken } from '../../plugins/tenant-context.js';
import { AppError, notFound, unauthorized } from '../../errors.js';

const registerResponse = z.object({ account: clientAccountResponseSchema });
// Ответ логина/регистрации клиента: профиль + сессионный токен (для нативных клиентов
// через Authorization: Bearer; веб продолжает пользоваться httpOnly-cookie).
const authResponse = z.object({ account: clientAccountResponseSchema, token: z.string() });

// Порт раздачи файла по id (HTTP-слой не импортирует repo/db — граница слоёв).
// Модуль передаёт files-repo, структурно совместимый с этим типом.
export type FileByIdPort = {
  getById(
    id: string,
  ): Promise<{ accountId: string | null; mime: string; storagePath: string } | null>;
};

export function clientAuthRoutes(
  app: FastifyInstance,
  svc: ClientAuthService,
  files: FileByIdPort,
  storage: Storage,
  isProd: boolean,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  function accountId(req: { clientAccountId?: string }): string {
    if (!req.clientAccountId) throw unauthorized('Требуется вход');
    return req.clientAccountId;
  }

  // Читает multipart-запрос аватара: собирает файл `photo` в буфер (по образцу
  // clients.routes). Прочие файловые части дренируем, чтобы не блокировать поток.
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

  function setSessionCookie(reply: FastifyReply, session: ClientSession): void {
    void reply.setCookie(CLIENT_SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      signed: false,
      expires: session.expiresAt,
    });
  }

  typed.post(
    '/api/client/auth/register',
    { schema: { body: clientRegisterRequestSchema, response: { 201: authResponse } } },
    async (req, reply) => {
      const { account, session } = await svc.register(req.body);
      setSessionCookie(reply, session);
      void reply.status(201);
      return { account, token: session.token };
    },
  );

  typed.post(
    '/api/client/auth/login',
    { schema: { body: clientLoginRequestSchema, response: { 200: authResponse } } },
    async (req, reply) => {
      const { account, session } = await svc.login(req.body);
      setSessionCookie(reply, session);
      return { account, token: session.token };
    },
  );

  typed.post(
    '/api/client/auth/logout',
    { schema: { response: { 200: z.object({ ok: z.literal(true) }) } } },
    async (req, reply) => {
      const token = req.cookies[CLIENT_SESSION_COOKIE] ?? bearerToken(req.headers.authorization);
      if (token) await svc.logout(token);
      void reply.clearCookie(CLIENT_SESSION_COOKIE, { path: '/' });
      return { ok: true as const };
    },
  );

  typed.get(
    '/api/client/auth/me',
    { schema: { response: { 200: clientMeResponseSchema } } },
    async (req) => {
      if (!req.clientAccountId) throw unauthorized('Требуется вход');
      return svc.me(req.clientAccountId);
    },
  );

  typed.patch(
    '/api/client/auth/me',
    {
      schema: {
        body: updateClientAccountRequestSchema,
        response: { 200: z.object({ account: clientAccountResponseSchema }) },
      },
    },
    async (req) => {
      if (!req.clientAccountId) throw unauthorized('Требуется вход');
      return { account: await svc.updateMe(req.clientAccountId, req.body) };
    },
  );

  // Аватар клиент-аккаунта: multipart (поле `photo`, image/*). Логика — в service.
  typed.post(
    '/api/client/auth/me/avatar',
    { preHandler: requireClient, schema: { response: { 200: registerResponse } } },
    async (req) => {
      const input = await readAvatar(req);
      return { account: await svc.setAvatar(accountId(req), input) };
    },
  );

  typed.delete(
    '/api/client/auth/me/avatar',
    { preHandler: requireClient, schema: { response: { 200: z.object({ ok: z.literal(true) }) } } },
    async (req) => {
      await svc.removeAvatar(accountId(req));
      return { ok: true as const };
    },
  );

  // Раздача собственного аватара: avatarFileId аккаунта → файл с проверкой владельца
  // (accountId === текущий) → стрим. Нет фото / чужой файл → 404. Тело бинарь — без zod.
  typed.get('/api/client/auth/me/avatar', { preHandler: requireClient }, async (req, reply) => {
    const fileId = await svc.findAvatarFileId(accountId(req));
    if (!fileId) throw notFound('Аватар не найден');
    const row = await files.getById(fileId);
    if (!row || row.accountId !== accountId(req)) throw notFound('Аватар не найден');
    reply.header('Content-Type', row.mime);
    return reply.send(storage.openRead(row.storagePath));
  });
}
