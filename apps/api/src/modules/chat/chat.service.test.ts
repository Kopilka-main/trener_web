import { describe, it, expect, vi } from 'vitest';
import type { ChatRepo, ConversationRow, MessageRow } from './chat.repo.js';
import { makeChatService } from './chat.service.js';

function convRow(over: Partial<ConversationRow> = {}): ConversationRow {
  return {
    id: 'conv1',
    trainerId: 'A',
    clientId: 'c1',
    lastMessageAt: null,
    trainerLastReadAt: null,
    clientLastReadAt: null,
    createdAt: new Date(0),
    ...over,
  };
}

function msgRow(over: Partial<MessageRow> = {}): MessageRow {
  return {
    id: 'm1',
    conversationId: 'conv1',
    senderRole: 'trainer',
    body: 'привет',
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
    markRead: vi.fn(() => Promise.resolve()),
    markReadByClient: vi.fn(() => Promise.resolve()),
    clientUnreadCount: vi.fn(() => Promise.resolve(0)),
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
    expect(addMessage).toHaveBeenCalledWith('A', 'c1', 'newid', 'хай', new Date(0), 'trainer');
  });

  it('markRead прокидывает scope и now', async () => {
    const markRead = vi.fn(() => Promise.resolve());
    const svc = makeChatService(fakeRepo({ markRead }), deps);
    await expect(svc.markRead('A', 'c1')).resolves.toBeUndefined();
    expect(markRead).toHaveBeenCalledWith('A', 'c1', new Date(0));
  });
});
