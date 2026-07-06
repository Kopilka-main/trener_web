import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { supportMessages, trainers, clientAccounts } from '../../db/schema.js';

export type SupportSource = 'trainer' | 'client';

// Строка обращения в поддержку (снимок отправителя фиксируется на момент записи).
export type SupportMessageRow = {
  id: string;
  source: SupportSource;
  trainerId: string | null;
  clientAccountId: string | null;
  email: string | null;
  name: string | null;
  text: string;
  createdAt: Date;
};

// Контактные данные отправителя (для снимка email/имени в обращении и письме админу).
export type SupportContact = { email: string; firstName: string; lastName: string };

// Репозиторий поддержки: единственное место с SQL. support_messages — админ-инбокс без
// тенант-скоупа (запись обращения глобальна, как telemetry). Контактные выборки читают
// email/имя отправителя из соответствующей таблицы (trainers / client_accounts).
export function makeSupportRepo(db: Db) {
  return {
    async insert(row: SupportMessageRow): Promise<void> {
      await db.insert(supportMessages).values(row);
    },

    // Контакт тренера-отправителя (для снимка), либо null если тренер не найден.
    async findTrainerContact(trainerId: string): Promise<SupportContact | null> {
      const [row] = await db
        .select({
          email: trainers.email,
          firstName: trainers.firstName,
          lastName: trainers.lastName,
        })
        .from(trainers)
        .where(eq(trainers.id, trainerId));
      return row ?? null;
    },

    // Контакт клиента-отправителя (для снимка), либо null если аккаунт не найден.
    async findClientContact(clientAccountId: string): Promise<SupportContact | null> {
      const [row] = await db
        .select({
          email: clientAccounts.email,
          firstName: clientAccounts.firstName,
          lastName: clientAccounts.lastName,
        })
        .from(clientAccounts)
        .where(eq(clientAccounts.id, clientAccountId));
      return row ?? null;
    },
  };
}

export type SupportRepo = ReturnType<typeof makeSupportRepo>;
