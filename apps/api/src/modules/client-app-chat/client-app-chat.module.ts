import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/client.js';
import type { Clock } from '../../core/app-deps.js';
import type { ClientLink } from '@trener/shared';
import { makeChatRepo } from '../chat/chat.repo.js';
import { makeChatService } from '../chat/chat.service.js';
import { clientAppChatRoutes } from './client-app-chat.routes.js';

export function registerClientAppChatModule(
  app: FastifyInstance,
  deps: {
    db: Db;
    clock: Clock;
    resolveScope: (id: string) => Promise<ClientLink>;
    // Триггер web push ТРЕНЕРУ на сообщение клиента (fire-and-forget).
    notifyTrainer?: (
      trainerId: string,
      payload: { title: string; body: string; url?: string },
    ) => void;
  },
): void {
  const svc = makeChatService(makeChatRepo(deps.db), {
    newId: deps.clock.newId,
    now: deps.clock.now,
    ...(deps.notifyTrainer ? { notifyTrainer: deps.notifyTrainer } : {}),
  });
  clientAppChatRoutes(app, svc, deps.resolveScope);
}
