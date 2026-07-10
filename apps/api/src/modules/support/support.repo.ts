import { and, asc, desc, eq, isNotNull } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { supportMessages, trainers, clientAccounts } from '../../db/schema.js';

export type SupportSource = 'trainer' | 'client';
export type SupportDirection = 'in' | 'out';
// Вид вложения обращения: image — картинка (превью), file — произвольный файл (скачивание).
export type SupportAttachmentKind = 'image' | 'file';

// Владелец переписки (для роутинга ответа и пуша). source различает контур.
export type SupportOwner = {
  source: SupportSource;
  trainerId: string | null;
  clientAccountId: string | null;
};

// Строка обращения/ответа поддержки (снимок отправителя фиксируется на момент записи).
// direction: 'in' — от пользователя, 'out' — ответ саппорта. telegramTopicId связывает
// переписку с темой (forum topic) в Telegram.
export type SupportMessageRow = {
  id: string;
  source: SupportSource;
  direction: SupportDirection;
  trainerId: string | null;
  clientAccountId: string | null;
  telegramTopicId: number | null;
  email: string | null;
  name: string | null;
  text: string;
  // Вложение обращения (только direction 'in'). NULL/отсутствует — текстовое сообщение.
  // attachmentFileId — ссылка на files.id (раздаётся GET /api/files/:id).
  attachmentFileId?: string | null;
  attachmentKind?: SupportAttachmentKind | null;
  attachmentName?: string | null;
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

    // Владелец обращения по id темы Telegram (для роутинга ответа саппорта обратно).
    // Ищем ПО 'in'-строке: тему создаёт обращение пользователя, ответы её лишь наследуют.
    async findOwnerByTopicId(topicId: number): Promise<SupportOwner | null> {
      const [row] = await db
        .select({
          source: supportMessages.source,
          trainerId: supportMessages.trainerId,
          clientAccountId: supportMessages.clientAccountId,
        })
        .from(supportMessages)
        .where(
          and(eq(supportMessages.telegramTopicId, topicId), eq(supportMessages.direction, 'in')),
        )
        .limit(1);
      return row ?? null;
    },

    // «Текущая тема» владельца: telegram_topic_id ПОСЛЕДНЕГО (max createdAt) его сообщения,
    // где тема задана. Одна тема на пользователя — новые обращения идут в неё; null → темы
    // ещё нет (заведём новую). Скоуп по контуру: тренер по trainer_id, клиент по account.
    async findCurrentTopicForOwner(owner: SupportOwner): Promise<number | null> {
      const ownerCond =
        owner.source === 'trainer'
          ? owner.trainerId != null
            ? and(
                eq(supportMessages.source, 'trainer'),
                eq(supportMessages.trainerId, owner.trainerId),
              )
            : null
          : owner.clientAccountId != null
            ? and(
                eq(supportMessages.source, 'client'),
                eq(supportMessages.clientAccountId, owner.clientAccountId),
              )
            : null;
      if (!ownerCond) return null;
      const [row] = await db
        .select({ telegramTopicId: supportMessages.telegramTopicId })
        .from(supportMessages)
        .where(and(ownerCond, isNotNull(supportMessages.telegramTopicId)))
        .orderBy(desc(supportMessages.createdAt))
        .limit(1);
      return row?.telegramTopicId ?? null;
    },

    // Вся переписка тренера (обращения + ответы), по возрастанию времени.
    async listForTrainer(trainerId: string): Promise<SupportMessageRow[]> {
      return db
        .select()
        .from(supportMessages)
        .where(eq(supportMessages.trainerId, trainerId))
        .orderBy(asc(supportMessages.createdAt));
    },

    // Вся переписка клиента (обращения + ответы), по возрастанию времени.
    async listForClient(clientAccountId: string): Promise<SupportMessageRow[]> {
      return db
        .select()
        .from(supportMessages)
        .where(eq(supportMessages.clientAccountId, clientAccountId))
        .orderBy(asc(supportMessages.createdAt));
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
