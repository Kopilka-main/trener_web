import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { unauthorized } from '../errors.js';
import { bearerToken } from './tenant-context.js';

export const CLIENT_SESSION_COOKIE = 'client_sid';

declare module 'fastify' {
  interface FastifyRequest {
    clientAccountId?: string;
  }
}

type ClientSessionRow = { clientAccountId: string; expiresAt: Date };

export type ClientContextOpts = {
  findSession: (id: string) => Promise<ClientSessionRow | null>;
  now?: () => Date;
};

const plugin: FastifyPluginAsync<ClientContextOpts> = (app, opts) => {
  const now = opts.now ?? (() => new Date());
  app.addHook('onRequest', async (req) => {
    // Веб — httpOnly-cookie; нативные приложения — заголовок Authorization: Bearer.
    const token = req.cookies[CLIENT_SESSION_COOKIE] ?? bearerToken(req.headers.authorization);
    if (!token) return;
    const session = await opts.findSession(token);
    if (!session) return;
    if (session.expiresAt.getTime() <= now().getTime()) return;
    req.clientAccountId = session.clientAccountId;
  });
  return Promise.resolve();
};

export const clientContext = fp(plugin, {
  name: 'client-context',
  dependencies: ['@fastify/cookie'],
});

export function requireClient(
  req: FastifyRequest,
  _reply: FastifyReply,
  done: (err?: Error) => void,
): void {
  if (!req.clientAccountId) {
    done(unauthorized('Требуется вход'));
    return;
  }
  done();
}
