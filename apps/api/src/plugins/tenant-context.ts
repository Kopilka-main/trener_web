import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { unauthorized } from '../errors.js';

export const SESSION_COOKIE = 'sid';

/** Токен сессии из заголовка `Authorization: Bearer <token>` (для нативных клиентов). */
export function bearerToken(authorization: string | undefined): string | undefined {
  if (!authorization) return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return m ? m[1] : undefined;
}

declare module 'fastify' {
  interface FastifyRequest {
    trainerId?: string;
  }
}

type SessionRow = { trainerId: string; expiresAt: Date };

export type TenantContextOpts = {
  findSession: (id: string) => Promise<SessionRow | null>;
  now?: () => Date;
};

const plugin: FastifyPluginAsync<TenantContextOpts> = (app, opts) => {
  const now = opts.now ?? (() => new Date());
  app.addHook('onRequest', async (req) => {
    // Веб — httpOnly-cookie; нативные приложения — заголовок Authorization: Bearer.
    const token = req.cookies[SESSION_COOKIE] ?? bearerToken(req.headers.authorization);
    if (!token) return;
    const session = await opts.findSession(token);
    if (!session) return;
    if (session.expiresAt.getTime() <= now().getTime()) return;
    req.trainerId = session.trainerId;
  });
  return Promise.resolve();
};

export const tenantContext = fp(plugin, {
  name: 'tenant-context',
  dependencies: ['@fastify/cookie'],
});

export function requireAuth(
  req: FastifyRequest,
  _reply: FastifyReply,
  done: (err?: Error) => void,
): void {
  if (!req.trainerId) {
    done(unauthorized('Требуется вход'));
    return;
  }
  done();
}
