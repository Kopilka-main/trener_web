import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { registerRequestSchema, loginRequestSchema, trainerResponseSchema } from '@trener/shared';
import type { AuthService, Session } from './auth.service.js';
import { SESSION_COOKIE } from '../../plugins/tenant-context.js';
import { unauthorized } from '../../errors.js';

const meResponse = z.object({ trainer: trainerResponseSchema });

export function authRoutes(app: FastifyInstance, svc: AuthService, isProd: boolean): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

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
    { schema: { body: registerRequestSchema, response: { 201: meResponse } } },
    async (req, reply) => {
      const { trainer, session } = await svc.register(req.body);
      setSessionCookie(reply, session);
      void reply.status(201);
      return { trainer };
    },
  );

  typed.post(
    '/api/auth/login',
    { schema: { body: loginRequestSchema, response: { 200: meResponse } } },
    async (req, reply) => {
      const { trainer, session } = await svc.login(req.body);
      setSessionCookie(reply, session);
      return { trainer };
    },
  );

  typed.post(
    '/api/auth/logout',
    { schema: { response: { 200: z.object({ ok: z.literal(true) }) } } },
    async (req, reply) => {
      const token = req.cookies[SESSION_COOKIE];
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
}
