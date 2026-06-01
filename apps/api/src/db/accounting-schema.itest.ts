import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql, eq } from 'drizzle-orm';
import { createDb } from './client.js';
import { trainers, clients, trainerClients, gyms, expenses, incomes } from './schema.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('accounting schema (integration)', () => {
  const { db, sql: pg } = createDb(url!);

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM expenses`);
    await db.execute(sql`DELETE FROM incomes`);
    await db.execute(sql`DELETE FROM gyms`);
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

  it('хранит gym с дефолтами nullable', async () => {
    await seedBase();
    await db.insert(gyms).values({ id: 'g1', trainerId: 'tr1', name: 'Зал №1' });
    const rows = await db.select().from(gyms).where(eq(gyms.id, 'g1'));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('Зал №1');
    expect(rows[0]?.monthlyRent).toBeNull();
    expect(rows[0]?.note).toBeNull();
  });

  it('хранит expense с привязками gym/client', async () => {
    await seedBase();
    await db.insert(gyms).values({ id: 'g1', trainerId: 'tr1', name: 'Зал' });
    await db.insert(expenses).values({
      id: 'e1',
      trainerId: 'tr1',
      category: 'Аренда',
      amount: 30000,
      date: '2026-06-01',
      gymId: 'g1',
      clientId: 'c1',
    });
    const rows = await db.select().from(expenses).where(eq(expenses.id, 'e1'));
    expect(rows[0]?.amount).toBe(30000);
    expect(rows[0]?.gymId).toBe('g1');
    expect(rows[0]?.clientId).toBe('c1');
  });

  it('удаление gym обнуляет expense.gymId (set null), запись остаётся', async () => {
    await seedBase();
    await db.insert(gyms).values({ id: 'g1', trainerId: 'tr1', name: 'Зал' });
    await db.insert(expenses).values({
      id: 'e1',
      trainerId: 'tr1',
      category: 'Аренда',
      amount: 100,
      date: '2026-06-01',
      gymId: 'g1',
    });
    await db.delete(gyms).where(eq(gyms.id, 'g1'));
    const rows = await db.select().from(expenses).where(eq(expenses.id, 'e1'));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.gymId).toBeNull();
  });

  it('каскад: удаление тренера удаляет gyms/expenses/incomes', async () => {
    await seedBase();
    await db.insert(gyms).values({ id: 'g1', trainerId: 'tr1', name: 'Зал' });
    await db
      .insert(expenses)
      .values({ id: 'e1', trainerId: 'tr1', category: 'X', amount: 1, date: '2026-06-01' });
    await db
      .insert(incomes)
      .values({ id: 'i1', trainerId: 'tr1', category: 'Y', amount: 2, date: '2026-06-01' });

    await db.delete(trainers).where(eq(trainers.id, 'tr1'));

    expect(await db.select().from(gyms)).toHaveLength(0);
    expect(await db.select().from(expenses)).toHaveLength(0);
    expect(await db.select().from(incomes)).toHaveLength(0);
  });
});
