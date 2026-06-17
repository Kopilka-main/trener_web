import { describe, it, expect, vi } from 'vitest';
import type { ChatRepo, ConversationRow, MessageRow } from './chat.repo.js';
import { makeChatService } from './chat.service.js';

function convRow(
  over: Partial<ConversationRow & { unreadCount: number }> = {},
): ConversationRow & { unreadCount: number } {
  return {
    id: 'conv1',
    trainerId: 'A',
    clientId: 'c1',
    lastMessageAt: null,
    trainerLastReadAt: null,
    clientLastReadAt: null,
    pinnedMessageId: null,
    createdAt: new Date(0),
    unreadCount: 0,
    ...over,
  };
}

function msgRow(over: Partial<MessageRow> = {}): MessageRow {
  return {
    id: 'm1',
    conversationId: 'conv1',
    senderRole: 'trainer',
    body: 'привет',
    kind: 'text',
    taskDone: null,
    pinned: false,
    replyToId: null,
    createdAt: new Date(0),
    ...over,
  };
}

function fakeRepo(over: Partial<ChatRepo> = {}): ChatRepo {
  return {
    getOrCreateConversation: vi.fn(() => Promise.resolve(convRow())),
    listConversations: vi.fn(() => Promise.resolve([])),
    listMessages: vi.fn(() => Promise.resolve([])),
    addMessage: vi.fn(() => Promise.resolve(msgRow())),
    completeTask: vi.fn(() => Promise.resolve(null)),
    deleteConversation: vi.fn(() => Promise.resolve(true)),
    markRead: vi.fn(() => Promise.resolve()),
    markReadByClient: vi.fn(() => Promise.resolve()),
    clientUnreadCount: vi.fn(() => Promise.resolve(0)),
    trainerUnreadConversationsCount: vi.fn(() => Promise.resolve(0)),
    trainerReadAt: vi.fn(() => Promise.resolve(null)),
    clientReadAt: vi.fn(() => Promise.resolve(null)),
    pinMessage: vi.fn(() => Promise.resolve(true)),
    unpinMessage: vi.fn(() => Promise.resolve()),
    getPinnedMessages: vi.fn(() => Promise.resolve([])),
    getReplyBrief: vi.fn(() => Promise.resolve(null)),
    ...over,
  };
}

const deps = { newId: () => 'newid', now: () => new Date(0) };

describe('chat.service', () => {
  it('listConversations резолвит ответы (lastMessageAt → ISO/null)', async () => {
    const listConversations = vi.fn(() =>
      Promise.resolve([
        convRow({ id: 'conv1', lastMessageAt: new Date(1000) }),
        convRow({ id: 'conv2', lastMessageAt: null }),
      ]),
    );
    const svc = makeChatService(fakeRepo({ listConversations }), deps);
    const res = await svc.listConversations('A');
    expect(res.map((c) => c.id)).toEqual(['conv1', 'conv2']);
    expect(res[0]?.lastMessageAt).toBe(new Date(1000).toISOString());
    expect(res[1]?.lastMessageAt).toBeNull();
    expect(listConversations).toHaveBeenCalledWith('A');
  });

  it('listMessages прокидывает scope и опции, резолвит ответы', async () => {
    const listMessages = vi.fn(() => Promise.resolve([msgRow(), msgRow({ id: 'm2' })]));
    const svc = makeChatService(fakeRepo({ listMessages }), deps);
    const res = await svc.listMessages('A', 'c1', { sinceId: 'm1' });
    expect(res.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(listMessages).toHaveBeenCalledWith('A', 'c1', { sinceId: 'm1' });
  });

  it('sendMessage генерирует id, прокидывает now, резолвит ответ', async () => {
    const addMessage = vi.fn(() => Promise.resolve(msgRow({ body: 'хай' })));
    const svc = makeChatService(fakeRepo({ addMessage }), deps);
    const res = await svc.sendMessage('A', 'c1', { body: 'хай' });
    expect(res.body).toBe('хай');
    expect(res.senderRole).toBe('trainer');
    expect(res.createdAt).toBe(new Date(0).toISOString());
    expect(addMessage).toHaveBeenCalledWith(
      'A',
      'c1',
      'newid',
      'хай',
      new Date(0),
      'trainer',
      'text',
      null,
      null,
    );
  });

  it('/task создаёт задачу (kind=task, taskDone=false), текст без префикса', async () => {
    const addMessage = vi.fn(() =>
      Promise.resolve(msgRow({ kind: 'task', taskDone: false, body: 'сдать анализы' })),
    );
    const svc = makeChatService(fakeRepo({ addMessage }), deps);
    const res = await svc.sendMessage('A', 'c1', { body: '/task сдать анализы' });
    expect(res.kind).toBe('task');
    expect(res.taskDone).toBe(false);
    expect(addMessage).toHaveBeenCalledWith(
      'A',
      'c1',
      'newid',
      'сдать анализы',
      new Date(0),
      'trainer',
      'task',
      false,
      null,
    );
  });

  it('/task от клиента — обычный текст (не задача)', async () => {
    const addMessage = vi.fn(() => Promise.resolve(msgRow()));
    const svc = makeChatService(fakeRepo({ addMessage }), deps);
    await svc.sendMessage('A', 'c1', { body: '/task что-то' }, 'client');
    expect(addMessage).toHaveBeenCalledWith(
      'A',
      'c1',
      'newid',
      '/task что-то',
      new Date(0),
      'client',
      'text',
      null,
      null,
    );
  });

  it('/pin создаёт обычное сообщение и закрепляет его', async () => {
    const addMessage = vi.fn(() => Promise.resolve(msgRow({ id: 'pm', body: 'совет дня' })));
    const pinMessage = vi.fn(() => Promise.resolve(true));
    const svc = makeChatService(fakeRepo({ addMessage, pinMessage }), deps);
    const res = await svc.sendMessage('A', 'c1', { body: '/pin совет дня' });
    expect(res.kind).toBe('text');
    expect(addMessage).toHaveBeenCalledWith(
      'A',
      'c1',
      'newid',
      'совет дня',
      new Date(0),
      'trainer',
      'text',
      null,
      null,
    );
    expect(pinMessage).toHaveBeenCalledWith('A', 'c1', 'pm', new Date(0));
  });

  it('/pin от клиента — обычный текст, без закрепа', async () => {
    const pinMessage = vi.fn(() => Promise.resolve(true));
    const addMessage = vi.fn(() => Promise.resolve(msgRow()));
    const svc = makeChatService(fakeRepo({ addMessage, pinMessage }), deps);
    await svc.sendMessage('A', 'c1', { body: '/pin совет' }, 'client');
    expect(addMessage).toHaveBeenCalledWith(
      'A',
      'c1',
      'newid',
      '/pin совет',
      new Date(0),
      'client',
      'text',
      null,
      null,
    );
    expect(pinMessage).not.toHaveBeenCalled();
  });

  it('reply: передаёт replyTo в addMessage и отдаёт превью цитаты', async () => {
    const addMessage = vi.fn(() => Promise.resolve(msgRow({ id: 'm2', replyToId: 'm1' })));
    const getReplyBrief = vi.fn(() =>
      Promise.resolve({ id: 'm1', senderRole: 'trainer' as const, body: 'привет' }),
    );
    const svc = makeChatService(fakeRepo({ addMessage, getReplyBrief }), deps);
    const res = await svc.sendMessage('A', 'c1', { body: 'ответ', replyTo: 'm1' });
    expect(addMessage).toHaveBeenCalledWith(
      'A',
      'c1',
      'newid',
      'ответ',
      new Date(0),
      'trainer',
      'text',
      null,
      'm1',
    );
    expect(getReplyBrief).toHaveBeenCalledWith('A', 'c1', 'm1');
    expect(res.replyTo).toEqual({ id: 'm1', senderRole: 'trainer', body: 'привет' });
  });

  it('getPinned резолвит список закреплённых (или пусто)', async () => {
    const withPin = makeChatService(
      fakeRepo({
        getPinnedMessages: vi.fn(() =>
          Promise.resolve([
            msgRow({ id: 'p1', body: 'совет 1' }),
            msgRow({ id: 'p2', body: 'совет 2' }),
          ]),
        ),
      }),
      deps,
    );
    const res = await withPin.getPinned('A', 'c1');
    expect(res.map((m) => m.body)).toEqual(['совет 1', 'совет 2']);
    const noPin = makeChatService(fakeRepo(), deps);
    await expect(noPin.getPinned('A', 'c1')).resolves.toEqual([]);
  });

  it('unpin снимает закреп с конкретного сообщения', async () => {
    const unpinMessage = vi.fn(() => Promise.resolve());
    const svc = makeChatService(fakeRepo({ unpinMessage }), deps);
    await svc.unpin('A', 'c1', 'pm');
    expect(unpinMessage).toHaveBeenCalledWith('A', 'c1', 'pm');
  });

  it('completeTask закрывает задачу и пишет системное сообщение', async () => {
    const completeTask = vi.fn(() => Promise.resolve('сдать анализы'));
    const addMessage = vi.fn(() =>
      Promise.resolve(msgRow({ kind: 'system', senderRole: 'client', body: 'done' })),
    );
    const svc = makeChatService(fakeRepo({ completeTask, addMessage }), deps);
    const res = await svc.completeTask('A', 'c1', 'm1');
    expect(res?.kind).toBe('system');
    expect(completeTask).toHaveBeenCalledWith('A', 'c1', 'm1', new Date(0));
    expect(addMessage).toHaveBeenCalledWith(
      'A',
      'c1',
      'newid',
      '✓ Задача выполнена: сдать анализы',
      new Date(0),
      'client',
      'system',
      null,
    );
  });

  it('completeTask на отсутствующую/закрытую задачу → null, без сообщения', async () => {
    const completeTask = vi.fn(() => Promise.resolve(null));
    const addMessage = vi.fn(() => Promise.resolve(msgRow()));
    const svc = makeChatService(fakeRepo({ completeTask, addMessage }), deps);
    const res = await svc.completeTask('A', 'c1', 'nope');
    expect(res).toBeNull();
    expect(addMessage).not.toHaveBeenCalled();
  });

  it('trainerUnread прокидывает trainerId и резолвит число', async () => {
    const trainerUnreadConversationsCount = vi.fn(() => Promise.resolve(3));
    const svc = makeChatService(fakeRepo({ trainerUnreadConversationsCount }), deps);
    await expect(svc.trainerUnread('A')).resolves.toBe(3);
    expect(trainerUnreadConversationsCount).toHaveBeenCalledWith('A');
  });

  it('markRead прокидывает scope и now', async () => {
    const markRead = vi.fn(() => Promise.resolve());
    const svc = makeChatService(fakeRepo({ markRead }), deps);
    await expect(svc.markRead('A', 'c1')).resolves.toBeUndefined();
    expect(markRead).toHaveBeenCalledWith('A', 'c1', new Date(0));
  });

  it('sendMessage по умолчанию trainer, с client — client', async () => {
    const addMessage = vi.fn((_t, _c, _id, body: string, _now, role?: 'trainer' | 'client') =>
      Promise.resolve({
        id: 'm1',
        conversationId: 'cv',
        senderRole: role ?? 'trainer',
        body,
        kind: 'text',
        taskDone: null,
        createdAt: new Date(0),
      } satisfies import('./chat.repo.js').MessageRow),
    );
    const svc = makeChatService(fakeRepo({ addMessage }), {
      newId: () => 'm1',
      now: () => new Date(0),
    });
    const a = await svc.sendMessage('t', 'c', { body: 'hi' });
    expect(a.senderRole).toBe('trainer');
    const b = await svc.sendMessage('t', 'c', { body: 'yo' }, 'client');
    expect(b.senderRole).toBe('client');
  });
});
