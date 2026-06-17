import { and, asc, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Db } from '../../db/client.js';
import { conversations, messages } from '../../db/schema.js';

/** Короткая цитата сообщения, на которое отвечают. */
export type ReplyBrief = { id: string; senderRole: 'trainer' | 'client'; body: string };

export type ConversationRow = {
  id: string;
  trainerId: string;
  clientId: string;
  lastMessageAt: Date | null;
  trainerLastReadAt: Date | null;
  clientLastReadAt: Date | null;
  pinnedMessageId: string | null;
  createdAt: Date;
};

export type MessageKindRow = 'text' | 'task' | 'system';

export type MessageRow = {
  id: string;
  conversationId: string;
  senderRole: 'trainer' | 'client';
  body: string;
  kind: MessageKindRow;
  taskDone: boolean | null;
  pinned: boolean;
  replyToId: string | null;
  // Заполняется только там, где делаем join с цитируемым (listMessages). Иначе undefined.
  reply?: ReplyBrief | null;
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
  clientLastReadAt: conversations.clientLastReadAt,
  pinnedMessageId: conversations.pinnedMessageId,
  createdAt: conversations.createdAt,
};

const messageColumns = {
  id: messages.id,
  conversationId: messages.conversationId,
  senderRole: messages.senderRole,
  body: messages.body,
  kind: messages.kind,
  taskDone: messages.taskDone,
  pinned: messages.pinned,
  replyToId: messages.replyToId,
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
    // createdAt как fallback для диалогов без сообщений). unreadCount — входящие от клиента
    // новее trainerLastReadAt (или все, если диалог ни разу не читался). Счётчик считаем
    // отдельным агрегат-запросом с join (квалифицированные колонки), затем мёржим по id.
    async listConversations(
      trainerId: string,
    ): Promise<(ConversationRow & { unreadCount: number })[]> {
      const rows = await db
        .select(conversationColumns)
        .from(conversations)
        .where(eq(conversations.trainerId, trainerId))
        .orderBy(
          desc(sql`coalesce(${conversations.lastMessageAt}, ${conversations.createdAt})`),
          desc(conversations.createdAt),
        );

      const counts = await db
        .select({
          conversationId: messages.conversationId,
          cnt: sql<number>`count(*)::int`,
        })
        .from(messages)
        .innerJoin(conversations, eq(conversations.id, messages.conversationId))
        .where(
          and(
            eq(conversations.trainerId, trainerId),
            eq(messages.senderRole, 'client'),
            or(
              isNull(conversations.trainerLastReadAt),
              gt(messages.createdAt, conversations.trainerLastReadAt),
            ),
          ),
        )
        .groupBy(messages.conversationId);

      const unreadByConv = new Map(counts.map((c) => [c.conversationId, c.cnt]));
      return rows.map((r) => ({ ...r, unreadCount: unreadByConv.get(r.id) ?? 0 }));
    },

    // Удаление диалога пары (тренер+клиент). Сообщения сносятся каскадом (FK onDelete).
    async deleteConversation(trainerId: string, clientId: string): Promise<boolean> {
      const res = await db
        .delete(conversations)
        .where(and(eq(conversations.trainerId, trainerId), eq(conversations.clientId, clientId)))
        .returning({ id: conversations.id });
      return res.length > 0;
    },

    // Сообщения диалога пары, сортировка по курсору (createdAt, id) asc. sinceId — для
    // polling: только сообщения «строго после» курсора. Tie-break по id защищает от потери
    // сообщений с равным createdAt (разрешение timestamp может совпасть). Нет диалога → [].
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
          .select({ id: messages.id, createdAt: messages.createdAt })
          .from(messages)
          .where(
            and(eq(messages.id, options.sinceId), eq(messages.conversationId, conversation.id)),
          );
        // Неизвестный sinceId не относится к диалогу — отдаём весь диалог (без фильтра).
        // Иначе курсор (createdAt, id): createdAt > s.createdAt OR (createdAt = s.createdAt AND id > s.id).
        if (since) {
          const cursor = or(
            gt(messages.createdAt, since.createdAt),
            and(eq(messages.createdAt, since.createdAt), gt(messages.id, since.id)),
          );
          if (cursor) filters.push(cursor);
        }
      }

      // LEFT JOIN на цитируемое сообщение — чтобы отдать короткое превью (id/автор/текст).
      const replied = alias(messages, 'replied');
      const rows = await db
        .select({
          ...messageColumns,
          replySenderRole: replied.senderRole,
          replyBody: replied.body,
        })
        .from(messages)
        .leftJoin(replied, eq(replied.id, messages.replyToId))
        .where(and(...filters))
        .orderBy(asc(messages.createdAt), asc(messages.id));

      return rows.map(({ replySenderRole, replyBody, ...m }) => ({
        ...m,
        reply:
          m.replyToId && replySenderRole && replyBody !== null
            ? { id: m.replyToId, senderRole: replySenderRole, body: replyBody }
            : null,
      }));
    },

    // Создать диалог при отсутствии, вставить сообщение, обновить lastMessageAt.
    // kind/taskDone: для задач (kind='task', taskDone=false) и системных плашек (kind='system').
    async addMessage(
      trainerId: string,
      clientId: string,
      messageId: string,
      body: string,
      now: Date,
      senderRole: 'trainer' | 'client' = 'trainer',
      kind: MessageKindRow = 'text',
      taskDone: boolean | null = null,
      replyToId: string | null = null,
    ): Promise<MessageRow> {
      const conversation = await getOrCreateConversation(trainerId, clientId, now);
      // Цитировать можно только сообщение этого же диалога (иначе игнорируем ссылку).
      let safeReplyTo: string | null = null;
      if (replyToId) {
        const [r] = await db
          .select({ id: messages.id })
          .from(messages)
          .where(and(eq(messages.id, replyToId), eq(messages.conversationId, conversation.id)));
        safeReplyTo = r ? replyToId : null;
      }
      // insert сообщения + обновление lastMessageAt атомарны: иначе при сбое между ними
      // диалог «потеряет» свежий lastMessageAt относительно вставленного сообщения.
      const row = await db.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(messages)
          .values({
            id: messageId,
            conversationId: conversation.id,
            senderRole,
            body,
            kind,
            taskDone,
            replyToId: safeReplyTo,
            createdAt: now,
          })
          .returning(messageColumns);
        await tx
          .update(conversations)
          .set({ lastMessageAt: now })
          .where(eq(conversations.id, conversation.id));
        return inserted;
      });
      // returning по PK всегда возвращает строку.
      return row!;
    },

    // Пометить сообщение закреплённым (флаг на сообщении — закрепов может быть несколько).
    // Сообщение должно принадлежать диалогу пары. now — для getOrCreate диалога.
    async pinMessage(
      trainerId: string,
      clientId: string,
      messageId: string,
      now: Date,
    ): Promise<boolean> {
      const conversation = await getOrCreateConversation(trainerId, clientId, now);
      const res = await db
        .update(messages)
        .set({ pinned: true })
        .where(and(eq(messages.id, messageId), eq(messages.conversationId, conversation.id)))
        .returning({ id: messages.id });
      return res.length > 0;
    },

    // Снять закреп с конкретного сообщения. Идемпотентно: нет диалога/сообщения → ничего.
    async unpinMessage(trainerId: string, clientId: string, messageId: string): Promise<void> {
      const conversation = await findConversation(trainerId, clientId);
      if (!conversation) return;
      await db
        .update(messages)
        .set({ pinned: false })
        .where(and(eq(messages.id, messageId), eq(messages.conversationId, conversation.id)));
    },

    // Короткая цитата сообщения диалога (для ответа на отправку). Нет/не своё → null.
    async getReplyBrief(
      trainerId: string,
      clientId: string,
      messageId: string,
    ): Promise<ReplyBrief | null> {
      const conversation = await findConversation(trainerId, clientId);
      if (!conversation) return null;
      const [r] = await db
        .select({ id: messages.id, senderRole: messages.senderRole, body: messages.body })
        .from(messages)
        .where(and(eq(messages.id, messageId), eq(messages.conversationId, conversation.id)));
      return r ?? null;
    },

    // Все закреплённые сообщения диалога (по возрастанию времени). Нет диалога → [].
    async getPinnedMessages(trainerId: string, clientId: string): Promise<MessageRow[]> {
      const conversation = await findConversation(trainerId, clientId);
      if (!conversation) return [];
      return db
        .select(messageColumns)
        .from(messages)
        .where(and(eq(messages.conversationId, conversation.id), eq(messages.pinned, true)))
        .orderBy(asc(messages.createdAt), asc(messages.id));
    },

    // Закрыть задачу (kind='task') в диалоге пары. Идемпотентно: уже закрытая или
    // не-задача → null. Возвращает текст задачи (для системного сообщения) при успехе.
    async completeTask(
      trainerId: string,
      clientId: string,
      messageId: string,
      now: Date,
    ): Promise<string | null> {
      const conversation = await findConversation(trainerId, clientId);
      if (!conversation) return null;
      const res = await db
        .update(messages)
        .set({ taskDone: true, taskCompletedAt: now })
        .where(
          and(
            eq(messages.id, messageId),
            eq(messages.conversationId, conversation.id),
            eq(messages.kind, 'task'),
            or(isNull(messages.taskDone), eq(messages.taskDone, false)),
          ),
        )
        .returning({ body: messages.body });
      return res[0]?.body ?? null;
    },

    // Отметить диалог прочитанным тренером (getOrCreate при отсутствии).
    async markRead(trainerId: string, clientId: string, now: Date): Promise<void> {
      const conversation = await getOrCreateConversation(trainerId, clientId, now);
      await db
        .update(conversations)
        .set({ trainerLastReadAt: now })
        .where(eq(conversations.id, conversation.id));
    },

    // Отметить диалог прочитанным КЛИЕНТОМ.
    async markReadByClient(trainerId: string, clientId: string, now: Date): Promise<void> {
      const conversation = await getOrCreateConversation(trainerId, clientId, now);
      await db
        .update(conversations)
        .set({ clientLastReadAt: now })
        .where(eq(conversations.id, conversation.id));
    },

    // Когда тренер последний раз читал диалог (для статуса «прочитано» у клиента).
    async trainerReadAt(trainerId: string, clientId: string): Promise<Date | null> {
      const conversation = await findConversation(trainerId, clientId);
      return conversation?.trainerLastReadAt ?? null;
    },

    // Когда клиент последний раз читал диалог (для статуса «прочитано» у тренера).
    async clientReadAt(trainerId: string, clientId: string): Promise<Date | null> {
      const conversation = await findConversation(trainerId, clientId);
      return conversation?.clientLastReadAt ?? null;
    },

    // Непрочитанные клиентом = сообщения тренера после clientLastReadAt (или все, если не читал).
    async clientUnreadCount(trainerId: string, clientId: string): Promise<number> {
      const conversation = await findConversation(trainerId, clientId);
      if (!conversation) return 0;
      const filters = [
        eq(messages.conversationId, conversation.id),
        eq(messages.senderRole, 'trainer'),
      ];
      if (conversation.clientLastReadAt !== null) {
        filters.push(gt(messages.createdAt, conversation.clientLastReadAt));
      }
      const rows = await db
        .select({ id: messages.id })
        .from(messages)
        .where(and(...filters));
      return rows.length;
    },

    // Сколько диалогов тренера имеют непрочитанные входящие сообщения: есть сообщение
    // от клиента новее trainerLastReadAt диалога (или диалог ни разу не читался).
    async trainerUnreadConversationsCount(trainerId: string): Promise<number> {
      const rows = await db
        .select({ convId: conversations.id })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(
          and(
            eq(conversations.trainerId, trainerId),
            eq(messages.senderRole, 'client'),
            or(
              isNull(conversations.trainerLastReadAt),
              sql`${messages.createdAt} > ${conversations.trainerLastReadAt}`,
            ),
          ),
        );
      return new Set(rows.map((r) => r.convId)).size;
    },
  };
}

export type ChatRepo = ReturnType<typeof makeChatRepo>;
