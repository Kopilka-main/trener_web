import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  registerRequestSchema,
  loginRequestSchema,
  trainerResponseSchema,
  updateTrainerRequestSchema,
} from '@trener/shared';
import type { AuthService, AvatarUploadInput, Session } from './auth.service.js';
import { SESSION_COOKIE, bearerToken } from '../../plugins/tenant-context.js';
import { AppError, unauthorized } from '../../errors.js';

const meResponse = z.object({ trainer: trainerResponseSchema });
// Ответ логина/регистрации: профиль + сессионный токен (для нативных клиентов через
// Authorization: Bearer; веб продолжает пользоваться httpOnly-cookie).
const authResponse = z.object({ trainer: trainerResponseSchema, token: z.string() });

export function authRoutes(app: FastifyInstance, svc: AuthService, isProd: boolean): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  function trainerId(req: { trainerId?: string }): string {
    if (!req.trainerId) throw unauthorized('Требуется вход');
    return req.trainerId;
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

  function setSessionCookie(reply: FastifyReply, session: Session): void {
    void reply.setCookie(SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      signed: false,
      expires: session.expiresAt,
    });
  }

  typed.post(
    '/api/auth/register',
    { schema: { body: registerRequestSchema, response: { 201: authResponse } } },
    async (req, reply) => {
      const { trainer, session } = await svc.register(req.body);
      setSessionCookie(reply, session);
      void reply.status(201);
      return { trainer, token: session.token };
    },
  );

  typed.post(
    '/api/auth/login',
    { schema: { body: loginRequestSchema, response: { 200: authResponse } } },
    async (req, reply) => {
      const { trainer, session } = await svc.login(req.body);
      setSessionCookie(reply, session);
      return { trainer, token: session.token };
    },
  );

  typed.post(
    '/api/auth/logout',
    { schema: { response: { 200: z.object({ ok: z.literal(true) }) } } },
    async (req, reply) => {
      const token = req.cookies[SESSION_COOKIE] ?? bearerToken(req.headers.authorization);
      if (token) await svc.logout(token);
      void reply.clearCookie(SESSION_COOKIE, { path: '/' });
      return { ok: true as const };
    },
  );

  // `requireAuth` (exported from tenant-context) — это seam для доменных роутов
  // Фазы 3: они навесят его как preHandler для гварда tenant-доступа. На `/me`
  // сужение делается инлайн (см. ниже), т.к. без preHandler TS не сузит
  // `req.trainerId` до non-null. Поэтому экспортируемый guard пока не используется в проде.
  typed.get('/api/auth/me', { schema: { response: { 200: meResponse } } }, async (req) => {
    if (!req.trainerId) throw unauthorized('Требуется вход');
    return { trainer: await svc.me(req.trainerId) };
  });

  typed.patch(
    '/api/auth/me',
    { schema: { body: updateTrainerRequestSchema, response: { 200: meResponse } } },
    async (req) => {
      if (!req.trainerId) throw unauthorized('Требуется вход');
      return { trainer: await svc.updateMe(req.trainerId, req.body) };
    },
  );

  // Аватар тренера: multipart (поле `photo`, image/*). Бизнес-логика — в service.
  typed.post('/api/auth/me/avatar', { schema: { response: { 200: meResponse } } }, async (req) => {
    const input = await readAvatar(req);
    return { trainer: await svc.setAvatar(trainerId(req), input) };
  });

  typed.delete(
    '/api/auth/me/avatar',
    { schema: { response: { 200: z.object({ ok: z.literal(true) }) } } },
    async (req) => {
      await svc.removeAvatar(trainerId(req));
      return { ok: true as const };
    },
  );
}
