import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { clientAccounts, clientSessionsAuth, clients, trainerClients } from '../../db/schema.js';

export type NewClientAccount = {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
};

export function makeClientAuthRepo(db: Db) {
  return {
    async createAccount(a: NewClientAccount) {
      const [row] = await db.insert(clientAccounts).values(a).returning();
      return row;
    },
    async findAccountByEmail(email: string) {
      const [row] = await db.select().from(clientAccounts).where(eq(clientAccounts.email, email));
      return row ?? null;
    },
    async findAccountById(id: string) {
      const [row] = await db.select().from(clientAccounts).where(eq(clientAccounts.id, id));
      return row ?? null;
    },
    // Проставляет/снимает аватар аккаунта, возвращает прежний avatarFileId (для чистки).
    // null fileId — снять аватар. null-результат — аккаунт не найден.
    async setAvatar(
      accountId: string,
      fileId: string | null,
    ): Promise<{ previousFileId: string | null } | null> {
      const [prev] = await db
        .select({ avatarFileId: clientAccounts.avatarFileId })
        .from(clientAccounts)
        .where(eq(clientAccounts.id, accountId));
      if (!prev) return null;
      await db
        .update(clientAccounts)
        .set({ avatarFileId: fileId })
        .where(eq(clientAccounts.id, accountId));
      return { previousFileId: prev.avatarFileId };
    },

    // avatarFileId аккаунта, либо null если аккаунт не найден / аватар не задан.
    async findAvatarFileId(accountId: string): Promise<string | null> {
      const [row] = await db
        .select({ avatarFileId: clientAccounts.avatarFileId })
        .from(clientAccounts)
        .where(eq(clientAccounts.id, accountId));
      return row?.avatarFileId ?? null;
    },

    async createSession(s: { id: string; clientAccountId: string; expiresAt: Date }) {
      await db.insert(clientSessionsAuth).values(s);
    },
    async findSession(id: string) {
      const [row] = await db.select().from(clientSessionsAuth).where(eq(clientSessionsAuth.id, id));
      return row ?? null;
    },
    async deleteSession(id: string) {
      await db.delete(clientSessionsAuth).where(eq(clientSessionsAuth.id, id));
    },

    // Резолвер скоупа: по accountId находит запись клиента и активную связь с тренером.
    // v1 — один тренер: берём первую активную связь детерминированно (createdAt, затем trainerId).
    async findScopeByAccountId(
      clientAccountId: string,
    ): Promise<{ trainerId: string; clientId: string } | null> {
      const [row] = await db
        .select({ trainerId: trainerClients.trainerId, clientId: trainerClients.clientId })
        .from(clients)
        .innerJoin(trainerClients, eq(trainerClients.clientId, clients.id))
        .where(and(eq(clients.accountId, clientAccountId), eq(trainerClients.status, 'active')))
        .orderBy(asc(trainerClients.createdAt), asc(trainerClients.trainerId))
        .limit(1);
      return row ?? null;
    },

    // Мягкая отвязка от тренера: снимаем только привязку аккаунта к карточке клиента
    // (clients.accountId = null). Данные клиента (тренировки, замеры, пакеты, история)
    // остаются нетронутыми у тренера — ничего не удаляется.
    async detachAccountFromClient(clientId: string): Promise<void> {
      await db.update(clients).set({ accountId: null }).where(eq(clients.id, clientId));
    },

    async updateAccount(
      id: string,
      patch: {
        firstName?: string;
        lastName?: string;
        birthDate?: string | null;
        contacts?: { type: string; value: string }[];
        bio?: string | null;
      },
    ) {
      if (Object.keys(patch).length === 0) {
        const [row] = await db.select().from(clientAccounts).where(eq(clientAccounts.id, id));
        return row ?? null;
      }
      const [row] = await db
        .update(clientAccounts)
        .set(patch)
        .where(eq(clientAccounts.id, id))
        .returning();
      return row ?? null;
    },

    // Существует ли клиентский аккаунт с таким id (для валидации привязки тренером).
    async accountExists(id: string): Promise<boolean> {
      const [row] = await db
        .select({ id: clientAccounts.id })
        .from(clientAccounts)
        .where(eq(clientAccounts.id, id));
      return !!row;
    },
  };
}

export type ClientAuthRepo = ReturnType<typeof makeClientAuthRepo>;
