import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql, eq } from 'drizzle-orm';
import { createDb } from './client.js';
import { trainers, clients, trainerClients, conversations, messages } from './schema.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('chat schema (integration)', () => {
  const { db, sql: pg } = createDb(url!);

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM messages`);
    await db.execute(sql`DELETE FROM conversations`);
    await db.execute(sql`DELETE FROM trainer_clients`);
    await db.execute(sql`DELETE FROM clients`);
    await db.execute(sql`DELETE FROM trainers`);
  });
  afterAll(async () => {
    await pg.end();
  });

  async function seedBase() {
    await db.insert(trainers).values({
      id: 'tr1',
      email: 't@b.co',
      passwordHash: 'h',
      firstName: 'Тр',
      lastName: 'Ен',
    });
    await db.insert(clients).values({ id: 'c1', firstName: 'Кли', lastName: 'Ент' });
    await db.insert(trainerClients).values({ trainerId: 'tr1', clientId: 'c1', status: 'active' });
  }

  it('хранит диалог; lastMessageAt/trainerLastReadAt опциональны (null)', async () => {
    await seedBase();
    await db.insert(conversations).values({ id: 'conv1', trainerId: 'tr1', clientId: 'c1' });
    const rows = await db.select().from(conversations).where(eq(conversations.id, 'conv1'));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.lastMessageAt).toBeNull();
    expect(rows[0]?.trainerLastReadAt).toBeNull();
  });

  it('UNIQUE (trainerId, clientId): второй диалог пары отклоняется', async () => {
    await seedBase();
    await db.insert(conversations).values({ id: 'conv1', trainerId: 'tr1', clientId: 'c1' });
    await expect(
      db.insert(conversations).values({ id: 'conv2', trainerId: 'tr1', clientId: 'c1' }),
    ).rejects.toThrow();
  });

  it('CHECK на senderRole: значение вне (trainer, client) отклоняется', async () => {
    await seedBase();
    await db.insert(conversations).values({ id: 'conv1', trainerId: 'tr1', clientId: 'c1' });
    await expect(
      db.execute(
        sql`INSERT INTO messages (id, conversation_id, sender_role, body) VALUES ('m1', 'conv1', 'bot', 'x')`,
      ),
    ).rejects.toThrow();
  });

  it('каскад: удаление диалога удаляет его сообщения', async () => {
    await seedBase();
    await db.insert(conversations).values({ id: 'conv1', trainerId: 'tr1', clientId: 'c1' });
    await db
      .insert(messages)
      .values({ id: 'm1', conversationId: 'conv1', senderRole: 'trainer', body: 'привет' });
    await db.delete(conversations).where(eq(conversations.id, 'conv1'));
    expect(await db.select().from(messages)).toHaveLength(0);
  });

  it('каскад: удаление клиента удаляет диалог и сообщения', async () => {
    await seedBase();
    await db.insert(conversations).values({ id: 'conv1', trainerId: 'tr1', clientId: 'c1' });
    await db
      .insert(messages)
      .values({ id: 'm1', conversationId: 'conv1', senderRole: 'trainer', body: 'привет' });
    await db.delete(clients).where(eq(clients.id, 'c1'));
    expect(await db.select().from(conversations)).toHaveLength(0);
    expect(await db.select().from(messages)).toHaveLength(0);
  });
});
