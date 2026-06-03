import type { FastifyRequest } from 'fastify';
import type { ClientLink } from '@trener/shared';
import { AppError, unauthorized } from '../errors.js';

export type ResolveScope = (clientAccountId: string) => Promise<ClientLink>;
export type ClientScope = { trainerId: string; clientId: string };

// Скоуп клиента из сессии: нет аккаунта → 401, нет привязки → 409 NOT_LINKED.
export function makeClientScope(resolveScope: ResolveScope) {
  return async function scope(req: FastifyRequest): Promise<ClientScope> {
    if (!req.clientAccountId) throw unauthorized('Требуется вход');
    const link = await resolveScope(req.clientAccountId);
    if (!link) throw new AppError(409, 'NOT_LINKED', 'Аккаунт не подключён к тренеру');
    return link;
  };
}
