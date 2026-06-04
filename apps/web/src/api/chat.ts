import { z } from 'zod';
import {
  sendMessageRequestSchema,
  messageResponseSchema,
  trainerChatMessagesResponseSchema,
  conversationListResponseSchema,
  type MessageResponse,
  type SendMessageRequest,
  type ConversationResponse,
  type TrainerChatMessagesResponse,
} from '@trener/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';

const messageEnvelopeSchema = z.object({ message: messageResponseSchema });

/** Интервал опроса ленты сообщений (мс). Вебсокетов в проекте нет — polling. */
const MESSAGES_REFETCH_MS = 4000;

export const clientMessagesQueryKey = (clientId: string) =>
  ['clients', clientId, 'messages'] as const;

export function listClientMessages(clientId: string): Promise<TrainerChatMessagesResponse> {
  return apiFetch(`/clients/${clientId}/messages`, {
    schema: trainerChatMessagesResponseSchema,
  });
}

/** Отметить диалог прочитанным тренером (POST .../messages/read). */
export function markConversationRead(clientId: string): Promise<void> {
  return apiFetch(`/clients/${clientId}/messages/read`, {
    method: 'POST',
    schema: z.object({ ok: z.literal(true) }),
  }).then(() => undefined);
}

/** Удалить переписку с клиентом (тренер-скоуп; работает и для отвязанных клиентов). */
export function deleteConversation(clientId: string): Promise<void> {
  return apiFetch(`/conversations/${clientId}`, {
    method: 'DELETE',
    schema: z.object({ ok: z.literal(true) }),
  }).then(() => undefined);
}

export function sendClientMessage(
  clientId: string,
  input: SendMessageRequest,
): Promise<MessageResponse> {
  return apiFetch(`/clients/${clientId}/messages`, {
    method: 'POST',
    body: sendMessageRequestSchema.parse(input),
    schema: messageEnvelopeSchema,
  }).then((r) => r.message);
}

/** Лента сообщений диалога с клиентом. Опрашивается каждые 4с. */
export function useChatMessages(clientId: string) {
  return useQuery({
    queryKey: clientMessagesQueryKey(clientId),
    queryFn: () => listClientMessages(clientId),
    enabled: clientId.length > 0,
    refetchInterval: MESSAGES_REFETCH_MS,
  });
}

/** Отправка сообщения тренером с инвалидацией ленты. */
export function useSendMessage(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => sendClientMessage(clientId, { body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientMessagesQueryKey(clientId) });
    },
  });
}

export const conversationsQueryKey = ['conversations'] as const;

export function listConversations(): Promise<ConversationResponse[]> {
  return apiFetch('/conversations', { schema: conversationListResponseSchema }).then(
    (r) => r.conversations,
  );
}

/** Список диалогов тренера (для экрана «Сообщения»). Опрашивается раз в 8с. */
export function useConversations() {
  return useQuery({
    queryKey: conversationsQueryKey,
    queryFn: listConversations,
    refetchInterval: 8000,
  });
}

const chatUnreadResponseSchema = z.object({ count: z.number() });
export const chatUnreadQueryKey = ['chat', 'unread'] as const;

/** Число диалогов с непрочитанными входящими — для плитки «Сообщения» на главной.
 * Опрашивается раз в 8с, чтобы счётчик/акцент обновлялись при новых сообщениях. */
export function useChatUnread() {
  return useQuery({
    queryKey: chatUnreadQueryKey,
    queryFn: () =>
      apiFetch('/chat/unread', { schema: chatUnreadResponseSchema }).then((r) => r.count),
    refetchInterval: 8000,
  });
}

/** Отметка диалога прочитанным тренером (при открытии чата) + обновление списка диалогов. */
export function useMarkConversationRead(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => markConversationRead(clientId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: conversationsQueryKey });
    },
  });
}

/** Удаление переписки с клиентом + обновление ленты, списка диалогов и счётчика. */
export function useDeleteConversation(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => deleteConversation(clientId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientMessagesQueryKey(clientId) });
      void qc.invalidateQueries({ queryKey: conversationsQueryKey });
      void qc.invalidateQueries({ queryKey: chatUnreadQueryKey });
    },
  });
}
