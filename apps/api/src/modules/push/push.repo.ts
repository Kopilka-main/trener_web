import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { pushSubscriptions, clients } from '../../db/schema.js';

export type StoredSubscription = { endpoint: string; p256dh: string; auth: string };
// Владелец подписки: ровно один из двух.
export type SubOwner = { clientAccountId: string } | { trainerId: string };

export function makePushRepo(db: Db) {
  return {
    // Upsert по endpoint: тот же браузер при повторной подписке перепривязывается
    // (в т.ч. может сменить владельца — клиент/тренер на одном устройстве).
    async upsert(id: string, owner: SubOwner, sub: StoredSubscription, now: Date): Promise<void> {
      const clientAccountId = 'clientAccountId' in owner ? owner.clientAccountId : null;
      const trainerId = 'trainerId' in owner ? owner.trainerId : null;
      await db
        .insert(pushSubscriptions)
        .values({
          id,
          clientAccountId,
          trainerId,
          endpoint: sub.endpoint,
          p256dh: sub.p256dh,
          auth: sub.auth,
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: pushSubscriptions.endpoint,
          set: { clientAccountId, trainerId, p256dh: sub.p256dh, auth: sub.auth },
        });
    },

    async deleteByEndpoint(endpoint: string): Promise<void> {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
    },

    async listByClientAccount(clientAccountId: string): Promise<StoredSubscription[]> {
      return db
        .select({
          endpoint: pushSubscriptions.endpoint,
          p256dh: pushSubscriptions.p256dh,
          auth: pushSubscriptions.auth,
        })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.clientAccountId, clientAccountId));
    },

    async listByTrainer(trainerId: string): Promise<StoredSubscription[]> {
      return db
        .select({
          endpoint: pushSubscriptions.endpoint,
          p256dh: pushSubscriptions.p256dh,
          auth: pushSubscriptions.auth,
        })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.trainerId, trainerId));
    },

    // clients.id → clients.accountId (clientAccountId). null, если клиент не привязан к аккаунту.
    async accountIdByClientId(clientId: string): Promise<string | null> {
      const [row] = await db
        .select({ accountId: clients.accountId })
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1);
      return row?.accountId ?? null;
    },
  };
}

export type PushRepo = ReturnType<typeof makePushRepo>;
