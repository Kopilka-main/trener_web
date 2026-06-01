import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql, eq } from 'drizzle-orm';
import { createDb } from './client.js';
import { trainers, clients, trainerClients, measurements } from './schema.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('measurements schema (integration)', () => {
  const { db, sql: pg } = createDb(url!);

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM measurements`);
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

  it('хранит замер; метрики опциональны (null по умолчанию)', async () => {
    await seedBase();
    await db.insert(measurements).values({
      id: 'm1',
      trainerId: 'tr1',
      clientId: 'c1',
      date: '2026-06-01',
      weightKg: 80,
    });

    const rows = await db.select().from(measurements).where(eq(measurements.id, 'm1'));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.trainerId).toBe('tr1');
    expect(rows[0]?.clientId).toBe('c1');
    expect(rows[0]?.date).toBe('2026-06-01');
    expect(rows[0]?.weightKg).toBe(80);
    expect(rows[0]?.bodyFatPct).toBeNull();
    expect(rows[0]?.chestCm).toBeNull();
    expect(rows[0]?.waistCm).toBeNull();
    expect(rows[0]?.hipsCm).toBeNull();
    expect(rows[0]?.note).toBeNull();
  });

  it('каскад: удаление клиента удаляет его замеры', async () => {
    await seedBase();
    await db.insert(measurements).values({
      id: 'm1',
      trainerId: 'tr1',
      clientId: 'c1',
      date: '2026-06-01',
    });

    await db.delete(clients).where(eq(clients.id, 'c1'));

    const rows = await db.select().from(measurements);
    expect(rows).toHaveLength(0);
  });
});
