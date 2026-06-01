import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { trainers, clients, trainerClients } from '../../db/schema.js';
import { makeAccountingRepo } from './accounting.repo.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('accounting.repo (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  const repo = makeAccountingRepo(db);

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM expenses`);
    await db.execute(sql`DELETE FROM incomes`);
    await db.execute(sql`DELETE FROM gyms`);
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
    // c1 связан с A, c2 связан с B.
    await db.insert(trainerClients).values([
      { trainerId: 'A', clientId: 'c1', status: 'active' },
      { trainerId: 'B', clientId: 'c2', status: 'active' },
    ]);
  });
  afterAll(async () => {
    await pg.end();
  });

  it('gyms CRUD scoped: создать/получить/список/апдейт/удалить; чужой не трогает', async () => {
    const g = await repo.createGym('A', { id: 'g1', name: 'Зал', monthlyRent: 30000 });
    expect(g.monthlyRent).toBe(30000);
    expect(await repo.getGym('A', 'g1')).not.toBeNull();
    expect(await repo.getGym('B', 'g1')).toBeNull(); // чужой

    await repo.createGym('A', { id: 'g2', name: 'Алый зал' });
    const list = await repo.listGyms('A');
    expect(list.map((r) => r.id)).toEqual(['g2', 'g1']); // сорт по name asc (Алый < Зал)

    expect(await repo.updateGym('B', 'g1', { name: 'Hack' })).toBeNull();
    const upd = await repo.updateGym('A', 'g1', { name: 'Зал №1' });
    expect(upd?.name).toBe('Зал №1');

    expect(await repo.deleteGym('B', 'g1')).toBe(false);
    expect(await repo.deleteGym('A', 'g1')).toBe(true);
    expect(await repo.getGym('A', 'g1')).toBeNull();
  });

  it('gymBelongsToTrainer / isClientLinked', async () => {
    await repo.createGym('A', { id: 'g1', name: 'Зал' });
    expect(await repo.gymBelongsToTrainer('A', 'g1')).toBe(true);
    expect(await repo.gymBelongsToTrainer('B', 'g1')).toBe(false);
    expect(await repo.isClientLinked('A', 'c1')).toBe(true);
    expect(await repo.isClientLinked('A', 'c2')).toBe(false);
  });

  it('expenses CRUD + фильтр по диапазону дат', async () => {
    await repo.createExpense('A', { id: 'e1', category: 'X', amount: 100, date: '2026-06-05' });
    await repo.createExpense('A', { id: 'e2', category: 'Y', amount: 200, date: '2026-06-10' });
    await repo.createExpense('A', { id: 'e3', category: 'Z', amount: 300, date: '2026-06-20' });

    // Сорт по date desc.
    const all = await repo.listExpenses('A');
    expect(all.map((r) => r.id)).toEqual(['e3', 'e2', 'e1']);

    const range = await repo.listExpenses('A', { from: '2026-06-05', to: '2026-06-10' });
    expect(range.map((r) => r.id)).toEqual(['e2', 'e1']);

    // B не видит расходы A.
    expect(await repo.listExpenses('B')).toHaveLength(0);

    const upd = await repo.updateExpense('A', 'e1', { amount: 150 });
    expect(upd?.amount).toBe(150);
    expect(await repo.updateExpense('B', 'e1', { amount: 1 })).toBeNull();
    expect(await repo.deleteExpense('B', 'e1')).toBe(false);
    expect(await repo.deleteExpense('A', 'e1')).toBe(true);
  });

  it('incomes CRUD + фильтр по диапазону дат', async () => {
    await repo.createIncome('A', { id: 'i1', category: 'X', amount: 1000, date: '2026-06-05' });
    await repo.createIncome('A', { id: 'i2', category: 'Y', amount: 2000, date: '2026-06-20' });

    const all = await repo.listIncomes('A');
    expect(all.map((r) => r.id)).toEqual(['i2', 'i1']);
    const range = await repo.listIncomes('A', { from: '2026-06-01', to: '2026-06-10' });
    expect(range.map((r) => r.id)).toEqual(['i1']);
    expect(await repo.listIncomes('B')).toHaveLength(0);
  });

  it('summary: суммы доход/расход/баланс за период, только своё', async () => {
    await repo.createIncome('A', { id: 'i1', category: 'X', amount: 1000, date: '2026-06-05' });
    await repo.createIncome('A', { id: 'i2', category: 'Y', amount: 500, date: '2026-06-25' });
    await repo.createExpense('A', { id: 'e1', category: 'X', amount: 300, date: '2026-06-10' });
    await repo.createExpense('A', { id: 'e2', category: 'Z', amount: 200, date: '2026-07-01' });
    // Чужие записи B не должны попасть в сводку A.
    await repo.createIncome('B', { id: 'bi', category: 'X', amount: 9999, date: '2026-06-05' });
    await repo.createExpense('B', { id: 'be', category: 'X', amount: 8888, date: '2026-06-05' });

    const full = await repo.summary('A', { from: '2026-06-01', to: '2026-06-30' });
    // Доход 1000+500=1500, расход 300 (e2 в июле — вне периода), баланс 1200.
    expect(full).toEqual({ totalIncome: 1500, totalExpense: 300, balance: 1200 });

    // Пустой период → нули.
    const empty = await repo.summary('A', { from: '2026-01-01', to: '2026-01-31' });
    expect(empty).toEqual({ totalIncome: 0, totalExpense: 0, balance: 0 });
  });

  it('expense с привязкой gym/client: запись хранит ссылки', async () => {
    await repo.createGym('A', { id: 'g1', name: 'Зал' });
    const e = await repo.createExpense('A', {
      id: 'e1',
      category: 'Аренда',
      amount: 100,
      date: '2026-06-01',
      gymId: 'g1',
      clientId: 'c1',
    });
    expect(e.gymId).toBe('g1');
    expect(e.clientId).toBe('c1');
  });
});
