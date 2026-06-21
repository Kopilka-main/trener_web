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
    kind: r.kind,
    taskDone: r.taskDone,
    replyTo: r.reply ?? null,
  };
}

// «/task сдать анализы» → текст задачи «сдать анализы». Только для сообщений тренера;
// без текста после команды — не задача. Возвращает null, если это не задача.
function parseTaskBody(body: string, senderRole: 'trainer' | 'client'): string | null {
  if (senderRole !== 'trainer') return null;
  const m = /^\/task\s+([\s\S]+)/.exec(body);
  const text = (m?.[1] ?? '').trim();
  return text.length > 0 ? text : null;
}

// «/pin совет дня» → текст «совет дня». Только тренер; создаёт обычное сообщение,
// которое сразу закрепляется в диалоге. Без текста — не команда (вернёт null).
function parsePinBody(body: string, senderRole: 'trainer' | 'client'): string | null {
  if (senderRole !== 'trainer') return null;
  const m = /^\/pin\s+([\s\S]+)/.exec(body);
  const text = (m?.[1] ?? '').trim();
  return text.length > 0 ? text : null;
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
      // Команды тренера: «/task …» → задача с чекбоксом; «/pin …» → обычное сообщение,
      // которое сразу закрепляется в диалоге (видно обоим).
      const taskBody = parseTaskBody(input.body, senderRole);
      const isTask = taskBody !== null;
      const pinBody = isTask ? null : parsePinBody(input.body, senderRole);
      const isPin = pinBody !== null;
      const body = taskBody ?? pinBody ?? input.body;
      const row = await repo.addMessage(
        trainerId,
        clientId,
        deps.newId(),
        body,
        deps.now(),
        senderRole,
        isTask ? 'task' : 'text',
        isTask ? false : null,
        input.replyTo ?? null,
      );
      if (isPin) await repo.pinMessage(trainerId, clientId, row.id, deps.now());
      // Превью цитаты в ответе на POST (в ленте оно подтянется join-ом при следующем опросе).
      if (row.replyToId) row.reply = await repo.getReplyBrief(trainerId, clientId, row.replyToId);
      // Пуш получателю с именем отправителя в заголовке (как в мессенджерах)
      // и числом непрочитанного для бейджа на иконке приложения.
      const preview = body.length > 120 ? `${body.slice(0, 117)}…` : body;
      if (senderRole === 'trainer' && deps.notify) {
        const badge = await repo.clientUnreadCount(trainerId, clientId);
        deps.notify(clientId, trainerId, (trainerName) => ({
          title: trainerName,
          body: isTask ? `Новая задача: ${preview}` : preview,
          url: isTask ? '/notifications' : '/chat',
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

    // Клиент закрывает задачу. Идемпотентно: уже закрытая/не-задача → null. При успехе —
    // системное сообщение «выполнена» в чат (видно обоим) + пуш тренеру.
    async completeTask(
      trainerId: string,
      clientId: string,
      messageId: string,
    ): Promise<MessageResponse | null> {
      const taskBody = await repo.completeTask(trainerId, clientId, messageId, deps.now());
      if (taskBody === null) return null;
      const sysRow = await repo.addMessage(
        trainerId,
        clientId,
        deps.newId(),
        `✓ Задача выполнена: ${taskBody}`,
        deps.now(),
        'client',
        'system',
        null,
      );
      if (deps.notifyTrainer) {
        const badge = await repo.trainerUnreadConversationsCount(trainerId);
        const short = taskBody.length > 100 ? `${taskBody.slice(0, 97)}…` : taskBody;
        deps.notifyTrainer(trainerId, clientId, (clientName) => ({
          title: clientName,
          body: `Задача выполнена: ${short}`,
          url: `/clients/${clientId}/chat`,
          badge,
        }));
      }
      return toMessageResponse(sysRow);
    },

    // Все закреплённые сообщения диалога (по возрастанию времени).
    async getPinned(trainerId: string, clientId: string): Promise<MessageResponse[]> {
      const rows = await repo.getPinnedMessages(trainerId, clientId);
      return rows.map(toMessageResponse);
    },

    // Закрепить конкретное сообщение (тренер).
    async pin(trainerId: string, clientId: string, messageId: string): Promise<void> {
      await repo.pinMessage(trainerId, clientId, messageId, deps.now());
    },

    // Снять закреп с конкретного сообщения (тренер).
    async unpin(trainerId: string, clientId: string, messageId: string): Promise<void> {
      await repo.unpinMessage(trainerId, clientId, messageId);
    },

    // Удалить одно сообщение диалога (тренер).
    async deleteMessage(trainerId: string, clientId: string, messageId: string): Promise<void> {
      await repo.deleteMessage(trainerId, clientId, messageId);
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
