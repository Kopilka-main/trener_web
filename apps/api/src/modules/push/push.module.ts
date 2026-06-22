import type { FastifyInstance } from 'fastify';
import webpush from 'web-push';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import type { Db } from '../../db/client.js';
import type { Clock } from '../../core/app-deps.js';
import { makePushRepo } from './push.repo.js';
import type { PushRepo } from './push.repo.js';
import {
  makePushService,
  type PushPayload,
  type PushService,
  type PushSender,
} from './push.service.js';
import { clientPushRoutes, trainerPushRoutes } from './push.routes.js';

export type VapidConfig = { publicKey: string; privateKey: string; subject: string };

// Инициализация FCM (firebase-admin) из GOOGLE_APPLICATION_CREDENTIALS. Возвращает
// функцию отправки на device-токены либо null (если ключ не задан/невалиден).
function makeFcmSender(
  app: FastifyInstance,
  repo: PushRepo,
): ((tokens: string[], payload: PushPayload) => Promise<void>) | null {
  try {
    if (getApps().length === 0) {
      initializeApp({ credential: applicationDefault() });
    }
    const messaging = getMessaging();
    return async (tokens, payload) => {
      const res = await messaging.sendEachForMulticast({
        tokens,
        notification: { title: payload.title, body: payload.body },
        data: payload.url ? { url: payload.url } : {},
        // Высокий приоритет: будит Android из Doze (иначе пуши придерживаются до
        // пробуждения телефона) и просит APNs доставить iOS немедленно со звуком.
        android: { priority: 'high' },
        apns: {
          headers: { 'apns-priority': '10' },
          payload: { aps: { sound: 'default' } },
        },
      });
      res.responses.forEach((r, i) => {
        if (r.success) return;
        const code = r.error?.code;
        // Протухший/невалидный токен — удаляем, чтобы не слать впустую.
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-argument'
        ) {
          const token = tokens[i];
          if (token) void repo.deleteDeviceToken(token);
        }
      });
    };
  } catch (err) {
    app.log.warn(
      { err },
      '[push] FCM не настроен (нет/невалиден service-account) — нативные пуши отключены',
    );
    return null;
  }
}

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
  const fcmSender = makeFcmSender(app, repo);
  if (fcmSender) app.log.info('[push] FCM (нативные пуши) включён');
  const svc = makePushService(repo, {
    newId: deps.clock.newId,
    now: deps.clock.now,
    publicKey,
    send,
    ...(fcmSender ? { sendFcm: fcmSender } : {}),
    fcmEnabled: fcmSender !== null,
    log: (msg, e) => {
      app.log.error({ err: e }, msg);
    },
  });
  clientPushRoutes(app, svc);
  trainerPushRoutes(app, svc);
  return svc;
}
