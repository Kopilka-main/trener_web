import type { PushSubscriptionInput } from '@trener/shared';
import type { PushRepo, StoredSubscription, SubOwner } from './push.repo.js';

export type PushPayload = { title: string; body: string; url?: string; badge?: number };
export type SendResult = { gone: boolean };
// Отправка одного пуша. `gone: true` — подписка протухла (404/410), её надо удалить.
export type PushSender = (sub: StoredSubscription, payload: string) => Promise<SendResult>;

export type PushDeps = {
  newId: () => string;
  now: () => Date;
  publicKey: string; // '' => web push отключён (нет VAPID-ключей)
  send: PushSender;
  // Отправка FCM на список device-токенов нативных приложений. No-op, если не настроено.
  sendFcm?: (tokens: string[], payload: PushPayload) => Promise<void>;
  fcmEnabled?: boolean;
  log?: (msg: string, err?: unknown) => void;
};

export function makePushService(repo: PushRepo, deps: PushDeps) {
  const enabled = deps.publicKey !== '';
  const fcmEnabled = deps.fcmEnabled ?? false;
  const anyEnabled = enabled || fcmEnabled;
  const sendFcm = deps.sendFcm ?? (async () => {});

  async function sendDevices(tokens: string[], payload: PushPayload): Promise<void> {
    if (tokens.length === 0) return;
    try {
      await sendFcm(tokens, payload);
    } catch (err) {
      deps.log?.('[push] fcm send failed', err);
    }
  }

  // Отправить владельцу во ВСЕ каналы: web-push подписки + FCM device-токены.
  async function sendAllClient(clientAccountId: string, payload: PushPayload): Promise<void> {
    await sendToSubs(await repo.listByClientAccount(clientAccountId), payload);
    await sendDevices(await repo.listDeviceTokensByClientAccount(clientAccountId), payload);
  }
  async function sendAllTrainer(trainerId: string, payload: PushPayload): Promise<void> {
    await sendToSubs(await repo.listByTrainer(trainerId), payload);
    await sendDevices(await repo.listDeviceTokensByTrainer(trainerId), payload);
  }

  async function sendToSubs(subs: StoredSubscription[], payload: PushPayload): Promise<void> {
    if (subs.length === 0) return;
    const body = JSON.stringify(payload);
    await Promise.all(
      subs.map(async (sub) => {
        try {
          const res = await deps.send(sub, body);
          if (res.gone) await repo.deleteByEndpoint(sub.endpoint);
        } catch (err) {
          deps.log?.('[push] send failed', err);
        }
      }),
    );
  }

  async function notifyClientAccount(clientAccountId: string, payload: PushPayload): Promise<void> {
    if (!anyEnabled) return;
    await sendAllClient(clientAccountId, payload);
  }

  return {
    enabled,
    publicKey: deps.publicKey,

    async subscribe(owner: SubOwner, sub: PushSubscriptionInput): Promise<void> {
      await repo.upsert(
        deps.newId(),
        owner,
        { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
        deps.now(),
      );
    },

    async unsubscribe(endpoint: string): Promise<void> {
      await repo.deleteByEndpoint(endpoint);
    },

    // Регистрация FCM device-токена нативного приложения (iOS/Android).
    async registerDevice(owner: SubOwner, token: string, platform: string): Promise<void> {
      await repo.upsertDeviceToken(deps.newId(), owner, token, platform, deps.now());
    },

    notifyClientAccount,

    // Триггер по clients.id (чат тренер→клиент): резолвит accountId и шлёт.
    async notifyByClientId(clientId: string, payload: PushPayload): Promise<void> {
      if (!anyEnabled) return;
      const accountId = await repo.accountIdByClientId(clientId);
      if (!accountId) return;
      await notifyClientAccount(accountId, payload);
    },

    // Триггер тренеру (чат клиент→тренер) на все его устройства.
    async notifyTrainer(trainerId: string, payload: PushPayload): Promise<void> {
      if (!anyEnabled) return;
      await sendAllTrainer(trainerId, payload);
    },

    // Пуш КЛИЕНТУ с подстановкой имени ТРЕНЕРА: build(имяТренера) → payload.
    async notifyClientFrom(
      clientId: string,
      trainerId: string,
      build: (trainerName: string) => PushPayload,
    ): Promise<void> {
      if (!anyEnabled) return;
      const accountId = await repo.accountIdByClientId(clientId);
      if (!accountId) return;
      const name = (await repo.trainerName(trainerId)) ?? 'Тренер';
      await sendAllClient(accountId, build(name));
    },

    // Пуш ТРЕНЕРУ с подстановкой имени КЛИЕНТА: build(имяКлиента) → payload.
    async notifyTrainerFrom(
      trainerId: string,
      clientId: string,
      build: (clientName: string) => PushPayload,
    ): Promise<void> {
      if (!anyEnabled) return;
      const name = (await repo.clientName(clientId)) ?? 'Клиент';
      await sendAllTrainer(trainerId, build(name));
    },
  };
}

export type PushService = ReturnType<typeof makePushService>;
