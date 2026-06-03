import type { ChatRepo, ConversationRow, MessageRow, ListMessagesOptions } from './chat.repo.js';
import type { ConversationResponse, MessageResponse, SendMessageRequest } from '@trener/shared';

export type ChatDeps = { newId: () => string; now: () => Date };

function toConversationResponse(r: ConversationRow): ConversationResponse {
  return {
    id: r.id,
    clientId: r.clientId,
    lastMessageAt: r.lastMessageAt ? r.lastMessageAt.toISOString() : null,
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
      return toMessageResponse(row);
    },

    async markRead(trainerId: string, clientId: string): Promise<void> {
      await repo.markRead(trainerId, clientId, deps.now());
    },

    async markReadByClient(trainerId: string, clientId: string): Promise<void> {
      await repo.markReadByClient(trainerId, clientId, deps.now());
    },

    clientUnread(trainerId: string, clientId: string): Promise<number> {
      return repo.clientUnreadCount(trainerId, clientId);
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
