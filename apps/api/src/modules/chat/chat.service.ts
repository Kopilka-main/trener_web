import type { ChatRepo, ConversationRow, MessageRow, ListMessagesOptions } from './chat.repo.js';
import type { ConversationResponse, MessageResponse, SendMessageRequest } from '@trener/shared';

export type PushPayload = { title: string; body: string; url?: string };

export type ChatDeps = {
  newId: () => string;
  now: () => Date;
  // Опциональный триггер web push КЛИЕНТУ (на сообщения тренера). Fire-and-forget.
  notify?: (clientId: string, payload: PushPayload) => void;
  // Опциональный триггер web push ТРЕНЕРУ (на сообщения клиента). Fire-and-forget.
  notifyTrainer?: (trainerId: string, payload: PushPayload) => void;
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
      // Пуш получателю: тренер пишет → клиенту; клиент пишет → тренеру.
      const preview = input.body.length > 120 ? `${input.body.slice(0, 117)}…` : input.body;
      if (senderRole === 'trainer' && deps.notify) {
        deps.notify(clientId, { title: 'Новое сообщение', body: preview, url: '/chat' });
      } else if (senderRole === 'client' && deps.notifyTrainer) {
        deps.notifyTrainer(trainerId, {
          title: 'Новое сообщение',
          body: preview,
          url: `/clients/${clientId}/chat`,
        });
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
