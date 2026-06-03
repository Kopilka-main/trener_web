import {
  clientChatMessagesResponseSchema,
  messageResponseSchema,
  type MessageResponse,
  type SendMessageRequest,
} from '@trener/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch, ApiError } from './client';

const messageWrap = z.object({ message: messageResponseSchema });
const unreadResponse = z.object({ count: z.number() });

export const clientMessagesQueryKey = ['client', 'chat', 'messages'] as const;
export const clientChatUnreadQueryKey = ['client', 'chat', 'unread'] as const;

/** Лента сообщений (поллинг). 409 (нет тренера) → пустой список. */
export function useClientMessages() {
  return useQuery<{ messages: MessageResponse[]; trainerLastReadAt: string | null }>({
    queryKey: clientMessagesQueryKey,
    queryFn: async () => {
      try {
        return await apiFetch('/client/chat/messages', {
          schema: clientChatMessagesResponseSchema,
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          return { messages: [], trainerLastReadAt: null };
        }
        throw err;
      }
    },
    refetchInterval: 4000,
  });
}

/** Счётчик непрочитанных для бейджа (поллинг). 409 → 0. */
export function useClientChatUnread() {
  return useQuery<number>({
    queryKey: clientChatUnreadQueryKey,
    queryFn: async () => {
      try {
        const r = await apiFetch('/client/chat/unread', { schema: unreadResponse });
        return r.count;
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) return 0;
        throw err;
      }
    },
    refetchInterval: 10000,
  });
}

export function useSendClientMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SendMessageRequest) =>
      apiFetch('/client/chat/messages', { method: 'POST', body: input, schema: messageWrap }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientMessagesQueryKey });
      void qc.invalidateQueries({ queryKey: clientChatUnreadQueryKey });
    },
  });
}

export function useMarkChatRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch('/client/chat/read', {
        method: 'POST',
        schema: z.object({ ok: z.literal(true) }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientChatUnreadQueryKey });
    },
  });
}
