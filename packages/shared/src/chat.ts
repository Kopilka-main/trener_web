import { z } from 'zod';

// --- Запрос на отправку сообщения ---

export const sendMessageRequestSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  /** Ответ на сообщение (id цитируемого). Необязательно. */
  replyTo: z.string().optional(),
});
export type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>;

// Короткая цитата сообщения, на которое отвечают (для отрисовки над текстом).
export const replyPreviewSchema = z.object({
  id: z.string(),
  senderRole: z.enum(['trainer', 'client']),
  body: z.string(),
});
export type ReplyPreview = z.infer<typeof replyPreviewSchema>;

// --- Ответы ---

// Вид сообщения: обычный текст, задача (с чекбоксом) или системная плашка
// (например «задача выполнена»). По умолчанию — text.
export const messageKindSchema = z.enum(['text', 'task', 'system']);
export type MessageKind = z.infer<typeof messageKindSchema>;

export const messageResponseSchema = z.object({
  id: z.string(),
  senderRole: z.enum(['trainer', 'client']),
  body: z.string(),
  createdAt: z.string(),
  kind: messageKindSchema,
  // Для kind='task' — текущий статус выполнения (true=закрыта). Иначе null.
  taskDone: z.boolean().nullable(),
  // Цитата сообщения, на которое отвечают (или null). Опционально для совместимости.
  replyTo: replyPreviewSchema.nullable().optional(),
});
export type MessageResponse = z.infer<typeof messageResponseSchema>;

export const conversationResponseSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  lastMessageAt: z.string().nullable(),
  /** Непрочитанные тренером входящие сообщения (от клиента). */
  unreadCount: z.number(),
  createdAt: z.string(),
});
export type ConversationResponse = z.infer<typeof conversationResponseSchema>;

export const conversationListResponseSchema = z.object({
  conversations: z.array(conversationResponseSchema),
});
export type ConversationListResponse = z.infer<typeof conversationListResponseSchema>;

export const messageListResponseSchema = z.object({
  messages: z.array(messageResponseSchema),
});
export type MessageListResponse = z.infer<typeof messageListResponseSchema>;

export const clientChatMessagesResponseSchema = z.object({
  messages: z.array(messageResponseSchema),
  trainerLastReadAt: z.string().nullable(),
  /** Закреплённые сообщения диалога (видно обоим), по возрастанию времени. Опционально:
   * пока старый API не отдаёт поле, фронт не должен падать на валидации. */
  pinnedMessages: z.array(messageResponseSchema).optional(),
});
export type ClientChatMessagesResponse = z.infer<typeof clientChatMessagesResponseSchema>;

// Лента у тренера: сообщения + момент прочтения КЛИЕНТОМ (статус «прочитано» у тренера).
export const trainerChatMessagesResponseSchema = z.object({
  messages: z.array(messageResponseSchema),
  clientLastReadAt: z.string().nullable(),
  /** Закреплённые сообщения диалога (видно обоим), по возрастанию времени. Опционально:
   * пока старый API не отдаёт поле, фронт не должен падать на валидации. */
  pinnedMessages: z.array(messageResponseSchema).optional(),
});
export type TrainerChatMessagesResponse = z.infer<typeof trainerChatMessagesResponseSchema>;
