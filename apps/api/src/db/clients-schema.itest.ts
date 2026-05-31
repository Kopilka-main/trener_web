import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from './client.js';
import { trainers, clients, trainerClients } from './schema.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('clients/trainer_clients schema (integration)', () => {
  const { db, sql: pg } = createDb(url!);

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM trainer_clients`);
    await db.execute(sql`DELETE FROM clients`);
    await db.execute(sql`DELETE FROM trainers`);
  });
  afterAll(async () => {
    await pg.end();
  });

  it('связывает клиента с тренером (M:N) и читает связь', async () => {
    await db.insert(trainers).values({
      id: 'tr1',
      email: 't@b.co',
      passwordHash: 'h',
      firstName: 'Тр',
      lastName: 'Ен',
    });
    await db.insert(clients).values({ id: 'c1', firstName: 'Кли', lastName: 'Ент' });
    await db.insert(trainerClients).values({ trainerId: 'tr1', clientId: 'c1', status: 'active' });
    const rows = await db.select().from(trainerClients);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('active');
  });
});
