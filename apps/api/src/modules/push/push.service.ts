import type { PushSubscriptionInput } from '@trener/shared';
import type { PushRepo, StoredSubscription } from './push.repo.js';

export type PushPayload = { title: string; body: string; url?: string };
export type SendResult = { gone: boolean };
// Отправка одного пуша. `gone: true` — подписка протухла (404/410), её надо удалить.
export type PushSender = (sub: StoredSubscription, payload: string) => Promise<SendResult>;

export type PushDeps = {
  newId: () => string;
  now: () => Date;
  publicKey: string; // '' => push отключён (нет VAPID-ключей)
  send: PushSender;
  log?: (msg: string, err?: unknown) => void;
};

export function makePushService(repo: PushRepo, deps: PushDeps) {
  const enabled = deps.publicKey !== '';

  async function notifyClientAccount(clientAccountId: string, payload: PushPayload): Promise<void> {
    if (!enabled) return;
    const subs = await repo.listByClientAccount(clientAccountId);
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

  return {
    enabled,
    publicKey: deps.publicKey,

    async subscribe(clientAccountId: string, sub: PushSubscriptionInput): Promise<void> {
      await repo.upsert(
        deps.newId(),
        clientAccountId,
        { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
        deps.now(),
      );
    },

    async unsubscribe(endpoint: string): Promise<void> {
      await repo.deleteByEndpoint(endpoint);
    },

    notifyClientAccount,

    // Триггер по clients.id (используется чатом): резолвит accountId и шлёт на все его устройства.
    async notifyByClientId(clientId: string, payload: PushPayload): Promise<void> {
      if (!enabled) return;
      const accountId = await repo.accountIdByClientId(clientId);
      if (!accountId) return;
      await notifyClientAccount(accountId, payload);
    },
  };
}

export type PushService = ReturnType<typeof makePushService>;
