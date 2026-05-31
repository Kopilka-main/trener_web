import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { unauthorized } from '../errors.js';

export const SESSION_COOKIE = 'sid';

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
    const token = req.cookies[SESSION_COOKIE];
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
