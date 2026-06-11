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
    // Освежать сразу при возврате к приложению и продолжать опрос даже когда
    // вкладка/PWA в фоне — чтобы плитки/счётчики «загорались» без ручного рефреша.
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: true,
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
    // Фолбэк-опрос (если push не включён). При push счётчик обновляется мгновенно
    // через PushSync, не дожидаясь интервала.
    refetchInterval: 4000,
    // Освежать сразу при возврате к приложению и продолжать опрос даже когда
    // вкладка/PWA в фоне — чтобы плитки/счётчики «загорались» без ручного рефреша.
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: true,
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

/** Клиент закрывает задачу (из чата или из уведомлений). Обновляет ленту и счётчики. */
export function useCompleteTask() {
  const qc = useQueryClient();
  return useMutation<{ message: MessageResponse }, ApiError, string>({
    mutationFn: (taskId) =>
      apiFetch(`/client/chat/tasks/${taskId}/complete`, { method: 'POST', schema: messageWrap }),
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
