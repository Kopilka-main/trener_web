import { and, asc, desc, eq, gt, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { conversations, messages } from '../../db/schema.js';

export type ConversationRow = {
  id: string;
  trainerId: string;
  clientId: string;
  lastMessageAt: Date | null;
  trainerLastReadAt: Date | null;
  createdAt: Date;
};

export type MessageRow = {
  id: string;
  conversationId: string;
  senderRole: 'trainer' | 'client';
  body: string;
  createdAt: Date;
};

export type ListMessagesOptions = {
  sinceId?: string;
};

const conversationColumns = {
  id: conversations.id,
  trainerId: conversations.trainerId,
  clientId: conversations.clientId,
  lastMessageAt: conversations.lastMessageAt,
  trainerLastReadAt: conversations.trainerLastReadAt,
  createdAt: conversations.createdAt,
};

const messageColumns = {
  id: messages.id,
  conversationId: messages.conversationId,
  senderRole: messages.senderRole,
  body: messages.body,
  createdAt: messages.createdAt,
};

// Репозиторий чата: scoped по паре (тренер, клиент) / по тренеру. HTTP-слой не импортирует.
export function makeChatRepo(db: Db) {
  async function findConversation(
    trainerId: string,
    clientId: string,
  ): Promise<ConversationRow | null> {
    const [row] = await db
      .select(conversationColumns)
      .from(conversations)
      .where(and(eq(conversations.trainerId, trainerId), eq(conversations.clientId, clientId)));
    return row ?? null;
  }

  // Идемпотентно вернуть диалог пары или создать. UNIQUE (trainerId, clientId) защищает
  // от гонки: при конфликте onConflictDoNothing + повторный select возвращает существующий.
  async function getOrCreateConversation(
    trainerId: string,
    clientId: string,
    now: Date,
  ): Promise<ConversationRow> {
    const existing = await findConversation(trainerId, clientId);
    if (existing) return existing;

    await db
      .insert(conversations)
      .values({
        // id = детерминированный по паре, чтобы повторный getOrCreate не плодил строки даже
        // без отдельного newId; UNIQUE-индекс остаётся источником истины.
        id: `conv_${trainerId}_${clientId}`,
        trainerId,
        clientId,
        createdAt: now,
      })
      .onConflictDoNothing({
        target: [conversations.trainerId, conversations.clientId],
      });

    const created = await findConversation(trainerId, clientId);
    // После insert/onConflict строка гарантированно существует.
    return created!;
  }

  return {
    getOrCreateConversation,

    // Диалоги тренера: сортировка по последней активности (lastMessageAt desc nulls last,
    // createdAt как fallback для диалогов без сообщений).
    async listConversations(trainerId: string): Promise<ConversationRow[]> {
      return db
        .select(conversationColumns)
        .from(conversations)
        .where(eq(conversations.trainerId, trainerId))
        .orderBy(
          desc(sql`coalesce(${conversations.lastMessageAt}, ${conversations.createdAt})`),
          desc(conversations.createdAt),
        );
    },

    // Сообщения диалога пары, сортировка createdAt asc. sinceId — для polling: только
    // сообщения, созданные строго после сообщения с этим id. Нет диалога → пустой список.
    async listMessages(
      trainerId: string,
      clientId: string,
      options: ListMessagesOptions = {},
    ): Promise<MessageRow[]> {
      const conversation = await findConversation(trainerId, clientId);
      if (!conversation) return [];

      const filters = [eq(messages.conversationId, conversation.id)];
      if (options.sinceId !== undefined) {
        const [since] = await db
          .select({ createdAt: messages.createdAt })
          .from(messages)
          .where(
            and(eq(messages.id, options.sinceId), eq(messages.conversationId, conversation.id)),
          );
        // Неизвестный sinceId не относится к диалогу — отдаём весь диалог (без фильтра).
        if (since) filters.push(gt(messages.createdAt, since.createdAt));
      }

      return db
        .select(messageColumns)
        .from(messages)
        .where(and(...filters))
        .orderBy(asc(messages.createdAt));
    },

    // Создать диалог при отсутствии, вставить сообщение тренера, обновить lastMessageAt.
    async addMessage(
      trainerId: string,
      clientId: string,
      messageId: string,
      body: string,
      now: Date,
    ): Promise<MessageRow> {
      const conversation = await getOrCreateConversation(trainerId, clientId, now);
      const [row] = await db
        .insert(messages)
        .values({
          id: messageId,
          conversationId: conversation.id,
          senderRole: 'trainer',
          body,
          createdAt: now,
        })
        .returning(messageColumns);
      await db
        .update(conversations)
        .set({ lastMessageAt: now })
        .where(eq(conversations.id, conversation.id));
      // returning по PK всегда возвращает строку.
      return row!;
    },

    // Отметить диалог прочитанным тренером (getOrCreate при отсутствии).
    async markRead(trainerId: string, clientId: string, now: Date): Promise<void> {
      const conversation = await getOrCreateConversation(trainerId, clientId, now);
      await db
        .update(conversations)
        .set({ trainerLastReadAt: now })
        .where(eq(conversations.id, conversation.id));
    },
  };
}

export type ChatRepo = ReturnType<typeof makeChatRepo>;
