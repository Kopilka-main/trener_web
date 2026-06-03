import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  clientRegisterRequestSchema,
  clientLoginRequestSchema,
  clientAccountResponseSchema,
  clientMeResponseSchema,
  updateClientAccountRequestSchema,
} from '@trener/shared';
import type { ClientAuthService, ClientSession } from './client-auth.service.js';
import { CLIENT_SESSION_COOKIE } from '../../plugins/client-context.js';
import { unauthorized } from '../../errors.js';

const registerResponse = z.object({ account: clientAccountResponseSchema });

export function clientAuthRoutes(
  app: FastifyInstance,
  svc: ClientAuthService,
  isProd: boolean,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

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
    { schema: { body: clientRegisterRequestSchema, response: { 201: registerResponse } } },
    async (req, reply) => {
      const { account, session } = await svc.register(req.body);
      setSessionCookie(reply, session);
      void reply.status(201);
      return { account };
    },
  );

  typed.post(
    '/api/client/auth/login',
    { schema: { body: clientLoginRequestSchema, response: { 200: registerResponse } } },
    async (req, reply) => {
      const { account, session } = await svc.login(req.body);
      setSessionCookie(reply, session);
      return { account };
    },
  );

  typed.post(
    '/api/client/auth/logout',
    { schema: { response: { 200: z.object({ ok: z.literal(true) }) } } },
    async (req, reply) => {
      const token = req.cookies[CLIENT_SESSION_COOKIE];
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
}
