import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { trainers, clients, trainerClients } from '../../db/schema.js';
import { makeChatRepo } from './chat.repo.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('chat.repo (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  const repo = makeChatRepo(db);

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM messages`);
    await db.execute(sql`DELETE FROM conversations`);
    await db.execute(sql`DELETE FROM trainer_clients`);
    await db.execute(sql`DELETE FROM clients`);
    await db.execute(sql`DELETE FROM trainers`);
    await db.insert(trainers).values([
      { id: 'A', email: 'a@b.co', passwordHash: 'h', firstName: 'A', lastName: 'A' },
      { id: 'B', email: 'b@b.co', passwordHash: 'h', firstName: 'B', lastName: 'B' },
      { id: 'chatT1', email: 'chatT1@b.co', passwordHash: 'h', firstName: 'T', lastName: '1' },
      { id: 'chatRT', email: 'chatRT@b.co', passwordHash: 'h', firstName: 'R', lastName: 'T' },
    ]);
    await db.insert(clients).values([
      { id: 'c1', firstName: 'Кл', lastName: 'А' },
      { id: 'c2', firstName: 'Кл', lastName: 'Б' },
      { id: 'chatC1', firstName: 'Кл', lastName: 'С' },
      { id: 'chatRC', firstName: 'Кл', lastName: 'R' },
    ]);
    await db.insert(trainerClients).values([
      { trainerId: 'A', clientId: 'c1', status: 'active' },
      { trainerId: 'B', clientId: 'c2', status: 'active' },
      { trainerId: 'chatT1', clientId: 'chatC1', status: 'active' },
      { trainerId: 'chatRT', clientId: 'chatRC', status: 'active' },
    ]);
  });
  afterAll(async () => {
    await pg.end();
  });

  it('getOrCreateConversation идемпотентен (повтор возвращает тот же диалог)', async () => {
    const first = await repo.getOrCreateConversation('A', 'c1', new Date('2026-06-01T10:00:00Z'));
    const second = await repo.getOrCreateConversation('A', 'c1', new Date('2026-06-01T11:00:00Z'));
    expect(second.id).toBe(first.id);
    expect(second.createdAt.toISOString()).toBe(first.createdAt.toISOString());

    const all = await repo.listConversations('A');
    expect(all).toHaveLength(1);
  });

  it('addMessage создаёт диалог при отсутствии, вставляет сообщение, обновляет lastMessageAt', async () => {
    const now = new Date('2026-06-01T12:00:00Z');
    const m = await repo.addMessage('A', 'c1', 'msg1', 'привет', now);
    expect(m.id).toBe('msg1');
    expect(m.senderRole).toBe('trainer');
    expect(m.body).toBe('привет');

    const convs = await repo.listConversations('A');
    expect(convs).toHaveLength(1);
    expect(convs[0]?.lastMessageAt?.toISOString()).toBe(now.toISOString());

    const msgs = await repo.listMessages('A', 'c1');
    expect(msgs.map((x) => x.id)).toEqual(['msg1']);
  });

  it('listMessages сортирует по createdAt asc; sinceId отдаёт только новые', async () => {
    await repo.addMessage('A', 'c1', 'm1', 'один', new Date('2026-06-01T10:00:00Z'));
    await repo.addMessage('A', 'c1', 'm2', 'два', new Date('2026-06-01T10:01:00Z'));
    await repo.addMessage('A', 'c1', 'm3', 'три', new Date('2026-06-01T10:02:00Z'));

    expect((await repo.listMessages('A', 'c1')).map((x) => x.id)).toEqual(['m1', 'm2', 'm3']);
    expect((await repo.listMessages('A', 'c1', { sinceId: 'm1' })).map((x) => x.id)).toEqual([
      'm2',
      'm3',
    ]);
    expect((await repo.listMessages('A', 'c1', { sinceId: 'm3' })).map((x) => x.id)).toEqual([]);
  });

  it('listMessages tie-break: два сообщения с равным createdAt — polling по sinceId первого не теряет второе', async () => {
    const now = new Date('2026-06-01T10:00:00Z');
    // Равный createdAt у обоих → различает только tie-break по id (m_a < m_b).
    await repo.addMessage('A', 'c1', 'm_a', 'один', now);
    await repo.addMessage('A', 'c1', 'm_b', 'два', now);

    // Полный список упорядочен по (createdAt, id).
    expect((await repo.listMessages('A', 'c1')).map((x) => x.id)).toEqual(['m_a', 'm_b']);
    // Polling по sinceId первого отдаёт второе, несмотря на равный createdAt.
    expect((await repo.listMessages('A', 'c1', { sinceId: 'm_a' })).map((x) => x.id)).toEqual([
      'm_b',
    ]);
    // Polling по sinceId второго (последнего) — пусто.
    expect((await repo.listMessages('A', 'c1', { sinceId: 'm_b' })).map((x) => x.id)).toEqual([]);
  });

  it('listMessages без диалога → пустой список', async () => {
    expect(await repo.listMessages('A', 'c1')).toEqual([]);
  });

  it('listConversations сортирует по lastMessageAt desc nulls last (createdAt fallback)', async () => {
    // c1 с сообщением (свежий lastMessageAt), c2 — без сообщений (только createdAt).
    await repo.getOrCreateConversation('A', 'c2', new Date('2026-06-01T08:00:00Z'));
    await repo.addMessage('A', 'c1', 'm1', 'привет', new Date('2026-06-01T12:00:00Z'));
    const convs = await repo.listConversations('A');
    expect(convs.map((c) => c.clientId)).toEqual(['c1', 'c2']);
  });

  it('markRead устанавливает trainerLastReadAt (getOrCreate при отсутствии диалога)', async () => {
    const now = new Date('2026-06-01T13:00:00Z');
    await repo.markRead('A', 'c1', now);
    const conv = await repo.getOrCreateConversation('A', 'c1', now);
    expect(conv.trainerLastReadAt?.toISOString()).toBe(now.toISOString());
  });

  it('addMessage пишет роль клиента; clientUnreadCount и markReadByClient', async () => {
    const t = 'chatT1';
    const c = 'chatC1';
    const now = new Date();
    await repo.addMessage(t, c, 'm-tr', 'от тренера', now, 'trainer');
    await repo.addMessage(t, c, 'm-cl', 'от клиента', new Date(now.getTime() + 1000), 'client');

    const msgs = await repo.listMessages(t, c);
    expect(msgs.map((m) => m.senderRole)).toEqual(['trainer', 'client']);

    expect(await repo.clientUnreadCount(t, c)).toBe(1);

    await repo.markReadByClient(t, c, new Date(now.getTime() + 2000));
    expect(await repo.clientUnreadCount(t, c)).toBe(0);

    await repo.addMessage(t, c, 'm-tr2', 'ещё', new Date(now.getTime() + 3000), 'trainer');
    expect(await repo.clientUnreadCount(t, c)).toBe(1);
  });

  it('trainerReadAt: null без диалога, дата после markRead тренером', async () => {
    expect(await repo.trainerReadAt('tNo', 'cNo')).toBeNull();
    const t = 'chatRT';
    const c = 'chatRC';
    const now = new Date();
    await repo.addMessage(t, c, 'm-rt', 'hi', now, 'client');
    expect(await repo.trainerReadAt(t, c)).toBeNull();
    await repo.markRead(t, c, new Date(now.getTime() + 1000));
    const at = await repo.trainerReadAt(t, c);
    expect(at).toBeInstanceOf(Date);
  });
});
