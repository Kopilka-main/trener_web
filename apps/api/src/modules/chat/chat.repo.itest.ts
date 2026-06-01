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
    ]);
    await db.insert(clients).values([
      { id: 'c1', firstName: 'Кл', lastName: 'А' },
      { id: 'c2', firstName: 'Кл', lastName: 'Б' },
    ]);
    await db.insert(trainerClients).values([
      { trainerId: 'A', clientId: 'c1', status: 'active' },
      { trainerId: 'B', clientId: 'c2', status: 'active' },
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
});
