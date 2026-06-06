import type { ChatRepo, ConversationRow, MessageRow, ListMessagesOptions } from './chat.repo.js';
import type { ConversationResponse, MessageResponse, SendMessageRequest } from '@trener/shared';

export type PushPayload = { title: string; body: string; url?: string; badge?: number };

export type ChatDeps = {
  newId: () => string;
  now: () => Date;
  // Пуш КЛИЕНТУ (сообщение тренера): build получает имя ТРЕНЕРА. Fire-and-forget.
  notify?: (
    clientId: string,
    trainerId: string,
    build: (trainerName: string) => PushPayload,
  ) => void;
  // Пуш ТРЕНЕРУ (сообщение клиента): build получает имя КЛИЕНТА. Fire-and-forget.
  notifyTrainer?: (
    trainerId: string,
    clientId: string,
    build: (clientName: string) => PushPayload,
  ) => void;
};

function toConversationResponse(
  r: ConversationRow & { unreadCount: number },
): ConversationResponse {
  return {
    id: r.id,
    clientId: r.clientId,
    lastMessageAt: r.lastMessageAt ? r.lastMessageAt.toISOString() : null,
    unreadCount: r.unreadCount,
    createdAt: r.createdAt.toISOString(),
  };
}

function toMessageResponse(r: MessageRow): MessageResponse {
  return {
    id: r.id,
    senderRole: r.senderRole,
    body: r.body,
    createdAt: r.createdAt.toISOString(),
  };
}

export function makeChatService(repo: ChatRepo, deps: ChatDeps) {
  return {
    async listConversations(trainerId: string): Promise<ConversationResponse[]> {
      const rows = await repo.listConversations(trainerId);
      return rows.map(toConversationResponse);
    },

    async listMessages(
      trainerId: string,
      clientId: string,
      options: ListMessagesOptions = {},
    ): Promise<MessageResponse[]> {
      const rows = await repo.listMessages(trainerId, clientId, options);
      return rows.map(toMessageResponse);
    },

    async sendMessage(
      trainerId: string,
      clientId: string,
      input: SendMessageRequest,
      senderRole: 'trainer' | 'client' = 'trainer',
    ): Promise<MessageResponse> {
      const row = await repo.addMessage(
        trainerId,
        clientId,
        deps.newId(),
        input.body,
        deps.now(),
        senderRole,
      );
      // Пуш получателю с именем отправителя в заголовке (как в мессенджерах)
      // и числом непрочитанного для бейджа на иконке приложения.
      const preview = input.body.length > 120 ? `${input.body.slice(0, 117)}…` : input.body;
      if (senderRole === 'trainer' && deps.notify) {
        const badge = await repo.clientUnreadCount(trainerId, clientId);
        deps.notify(clientId, trainerId, (trainerName) => ({
          title: trainerName,
          body: preview,
          url: '/chat',
          badge,
        }));
      } else if (senderRole === 'client' && deps.notifyTrainer) {
        const badge = await repo.trainerUnreadConversationsCount(trainerId);
        deps.notifyTrainer(trainerId, clientId, (clientName) => ({
          title: clientName,
          body: preview,
          url: `/clients/${clientId}/chat`,
          badge,
        }));
      }
      return toMessageResponse(row);
    },

    async markRead(trainerId: string, clientId: string): Promise<void> {
      await repo.markRead(trainerId, clientId, deps.now());
    },

    // Удалить диалог с клиентом (всю переписку). Идемпотентно: нет диалога → ничего.
    async deleteConversation(trainerId: string, clientId: string): Promise<void> {
      await repo.deleteConversation(trainerId, clientId);
    },

    async markReadByClient(trainerId: string, clientId: string): Promise<void> {
      await repo.markReadByClient(trainerId, clientId, deps.now());
    },

    clientUnread(trainerId: string, clientId: string): Promise<number> {
      return repo.clientUnreadCount(trainerId, clientId);
    },

    // Сколько диалогов тренера с непрочитанными входящими (для бейджа «Сообщения»).
    trainerUnread(trainerId: string): Promise<number> {
      return repo.trainerUnreadConversationsCount(trainerId);
    },

    async trainerReadAt(trainerId: string, clientId: string): Promise<string | null> {
      const at = await repo.trainerReadAt(trainerId, clientId);
      return at ? at.toISOString() : null;
    },

    async clientReadAt(trainerId: string, clientId: string): Promise<string | null> {
      const at = await repo.clientReadAt(trainerId, clientId);
      return at ? at.toISOString() : null;
    },
  };
}

export type ChatService = ReturnType<typeof makeChatService>;
