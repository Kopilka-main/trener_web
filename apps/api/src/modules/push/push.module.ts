import type { FastifyInstance } from 'fastify';
import webpush from 'web-push';
import type { Db } from '../../db/client.js';
import type { Clock } from '../../core/app-deps.js';
import { makePushRepo } from './push.repo.js';
import { makePushService, type PushService, type PushSender } from './push.service.js';
import { pushRoutes } from './push.routes.js';

export type VapidConfig = { publicKey: string; privateKey: string; subject: string };

// Composition root push-модуля: настраивает web-push (VAPID), собирает repo+service
// и навешивает клиентские роуты. Возвращает service, чтобы chat-модуль мог слать пуши.
// Без VAPID-ключей push мягко отключается (подписка/отправка — no-op).
export function registerPushModule(
  app: FastifyInstance,
  deps: { db: Db; clock: Clock; vapid?: VapidConfig },
): PushService {
  const vapid = deps.vapid;
  const publicKey = vapid?.publicKey ?? '';

  let send: PushSender;
  if (vapid && vapid.publicKey !== '' && vapid.privateKey !== '') {
    webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
    send = async (sub, payload) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        return { gone: false };
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        // 404/410 — подписка протухла (отписались/сменили устройство) → удаляем.
        if (code === 404 || code === 410) return { gone: true };
        throw err;
      }
    };
  } else {
    send = () => Promise.resolve({ gone: false });
    app.log.warn('[push] VAPID-ключи не заданы — web push отключён');
  }

  const repo = makePushRepo(deps.db);
  const svc = makePushService(repo, {
    newId: deps.clock.newId,
    now: deps.clock.now,
    publicKey,
    send,
    log: (msg, e) => {
      app.log.error({ err: e }, msg);
    },
  });
  pushRoutes(app, svc);
  return svc;
}
