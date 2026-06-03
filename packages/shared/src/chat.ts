import { z } from 'zod';

// --- Запрос на отправку сообщения ---

export const sendMessageRequestSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});
export type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>;

// --- Ответы ---

export const messageResponseSchema = z.object({
  id: z.string(),
  senderRole: z.enum(['trainer', 'client']),
  body: z.string(),
  createdAt: z.string(),
});
export type MessageResponse = z.infer<typeof messageResponseSchema>;

export const conversationResponseSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  lastMessageAt: z.string().nullable(),
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
});
export type ClientChatMessagesResponse = z.infer<typeof clientChatMessagesResponseSchema>;
