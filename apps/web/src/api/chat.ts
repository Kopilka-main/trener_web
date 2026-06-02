import { z } from 'zod';
import {
  sendMessageRequestSchema,
  messageResponseSchema,
  messageListResponseSchema,
  type MessageResponse,
  type SendMessageRequest,
} from '@trener/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';

const messageEnvelopeSchema = z.object({ message: messageResponseSchema });

/** Интервал опроса ленты сообщений (мс). Вебсокетов в проекте нет — polling. */
const MESSAGES_REFETCH_MS = 4000;

export const clientMessagesQueryKey = (clientId: string) =>
  ['clients', clientId, 'messages'] as const;

export function listClientMessages(clientId: string): Promise<MessageResponse[]> {
  return apiFetch(`/clients/${clientId}/messages`, {
    schema: messageListResponseSchema,
  }).then((r) => r.messages);
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
