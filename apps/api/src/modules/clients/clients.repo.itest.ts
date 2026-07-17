import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import {
  trainers,
  clients,
  trainerClients,
  incomes,
  expenses,
  paymentPackages,
} from '../../db/schema.js';
import { makeClientsRepo } from './clients.repo.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('clients.repo (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  const repo = makeClientsRepo(db);

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM incomes`);
    await db.execute(sql`DELETE FROM expenses`);
    await db.execute(sql`DELETE FROM payment_packages`);
    await db.execute(sql`DELETE FROM trainer_clients`);
    await db.execute(sql`DELETE FROM clients`);
    await db.execute(sql`DELETE FROM trainers`);
    await db.insert(trainers).values([
      { id: 'A', email: 'a@b.co', passwordHash: 'h', firstName: 'A', lastName: 'A' },
      { id: 'B', email: 'b@b.co', passwordHash: 'h', firstName: 'B', lastName: 'B' },
    ]);
  });
  afterAll(async () => {
    await pg.end();
  });

  it('create + listByTrainer видит только своих', async () => {
    await repo.create({ clientId: 'c1', trainerId: 'A', firstName: 'Кли', lastName: 'Ент' });
    expect(await repo.listByTrainer('A')).toHaveLength(1);
    expect(await repo.listByTrainer('B')).toHaveLength(0);
  });

  it('getForTrainer изолирован по тренеру', async () => {
    await repo.create({ clientId: 'c1', trainerId: 'A', firstName: 'Кли', lastName: 'Ент' });
    expect(await repo.getForTrainer('A', 'c1')).not.toBeNull();
    expect(await repo.getForTrainer('B', 'c1')).toBeNull(); // чужой тренер не видит
  });

  it('update меняет персону и профиль; unlink рвёт связь', async () => {
    await repo.create({ clientId: 'c1', trainerId: 'A', firstName: 'Кли', lastName: 'Ент' });
    const upd = await repo.update('A', 'c1', {
      firstName: 'Новое',
      status: 'archived',
      notes: 'n',
    });
    expect(upd?.firstName).toBe('Новое');
    expect(upd?.status).toBe('archived');
    expect(await repo.unlink('A', 'c1', () => 'inc1')).toBe(true);
    expect(await repo.getForTrainer('A', 'c1')).toBeNull();
  });

  it('update изолирован: чужой тренер не мутирует персону', async () => {
    await repo.create({ clientId: 'c1', trainerId: 'A', firstName: 'Кли', lastName: 'Ент' });
    expect(await repo.update('B', 'c1', { firstName: 'Hacked' })).toBeNull();
    const row = await repo.getForTrainer('A', 'c1');
    expect(row?.firstName).toBe('Кли'); // персона не мутирована
  });

  it('unlink обнуляет clientId у доходов/расходов и дописывает пометку в note', async () => {
    await repo.create({ clientId: 'c1', trainerId: 'A', firstName: 'Кли', lastName: 'Ент' });
    await db.insert(incomes).values({
      id: 'inc1',
      trainerId: 'A',
      category: 'Разовая тренировка',
      amount: 1500,
      date: '2026-06-01',
      clientId: 'c1',
      note: 'нал',
    });
    await db.insert(expenses).values({
      id: 'exp1',
      trainerId: 'A',
      category: 'Аренда зала',
      amount: 500,
      date: '2026-06-02',
      clientId: 'c1',
      note: null,
    });

    expect(await repo.unlink('A', 'c1', () => 'inc-new')).toBe(true);

    const [inc] = await db.select().from(incomes).where(eq(incomes.id, 'inc1'));
    expect(inc?.clientId).toBeNull();
    expect(inc?.note).toBe('нал · Кли Ент (профиль удалён)');

    const [exp] = await db.select().from(expenses).where(eq(expenses.id, 'exp1'));
    expect(exp?.clientId).toBeNull();
    // note было пустым (null) → в нём остаётся только сама пометка, без «· »
    expect(exp?.note).toBe('Кли Ент (профиль удалён)');
  });

  it('unlink конвертирует активный пакет в доход с той же суммой/датой и удаляет пакет', async () => {
    await repo.create({ clientId: 'c1', trainerId: 'A', firstName: 'Кли', lastName: 'Ент' });
    await db.insert(paymentPackages).values({
      id: 'pkg1',
      trainerId: 'A',
      clientId: 'c1',
      kind: 'package',
      lessonsPaid: 10,
      pricePerLesson: 1500,
      totalPaid: 15000,
      workoutType: 'Силовая',
      startsAt: '2026-06-01',
      status: 'active',
      note: 'нал',
      tags: [],
    });

    expect(await repo.unlink('A', 'c1', () => 'inc-conv')).toBe(true);

    // пакет удалён
    const pkgs = await db.select().from(paymentPackages).where(eq(paymentPackages.id, 'pkg1'));
    expect(pkgs).toHaveLength(0);

    // вместо него — доход с тем же totalPaid/startsAt
    const [inc] = await db.select().from(incomes).where(eq(incomes.id, 'inc-conv'));
    expect(inc).toBeDefined();
    expect(inc?.amount).toBe(15000);
    expect(inc?.date).toBe('2026-06-01');
    expect(inc?.category).toBe('Пакет тренировок');
    expect(inc?.clientId).toBeNull();
    expect(inc?.note).toBe('Силовая · нал · Кли Ент (профиль удалён)');
  });

  it('unlink на отменённом пакете НЕ создаёт доход, но пакет всё равно удаляется', async () => {
    await repo.create({ clientId: 'c1', trainerId: 'A', firstName: 'Кли', lastName: 'Ент' });
    await db.insert(paymentPackages).values({
      id: 'pkg-cancelled',
      trainerId: 'A',
      clientId: 'c1',
      kind: 'package',
      lessonsPaid: 10,
      pricePerLesson: 1500,
      totalPaid: 15000,
      startsAt: '2026-06-01',
      status: 'cancelled',
      tags: [],
    });

    expect(await repo.unlink('A', 'c1', () => 'inc-should-not-exist')).toBe(true);

    // доход по отменённому пакету не создан
    const incs = await db.select().from(incomes);
    expect(incs).toHaveLength(0);

    // но сам пакет код всё равно удаляет (без разбора по статусу) — фиксируем факт. поведение
    const pkgs = await db
      .select()
      .from(paymentPackages)
      .where(eq(paymentPackages.id, 'pkg-cancelled'));
    expect(pkgs).toHaveLength(0);
  });

  it('повторный unlink возвращает false и не задваивает доход от пакета', async () => {
    await repo.create({ clientId: 'c1', trainerId: 'A', firstName: 'Кли', lastName: 'Ент' });
    await db.insert(paymentPackages).values({
      id: 'pkg1',
      trainerId: 'A',
      clientId: 'c1',
      kind: 'package',
      lessonsPaid: 10,
      pricePerLesson: 1500,
      totalPaid: 15000,
      startsAt: '2026-06-01',
      status: 'active',
      tags: [],
    });

    expect(await repo.unlink('A', 'c1', () => 'inc-first')).toBe(true);
    expect(await repo.unlink('A', 'c1', () => 'inc-second')).toBe(false);

    const incs = await db.select().from(incomes);
    expect(incs).toHaveLength(1);
    expect(incs[0]?.id).toBe('inc-first');
  });

  it('unlink изолирован: не трогает доход/пакет/связь другого тренера по тому же клиенту', async () => {
    // «Персона» c_shared привязана к двум тренерам одновременно (свободна от repo.create,
    // т.к. clients.id — общий PK и не может быть создан дважды).
    await db.insert(clients).values({ id: 'c_shared', firstName: 'Общий', lastName: 'Клиент' });
    await db.insert(trainerClients).values([
      { trainerId: 'A', clientId: 'c_shared', status: 'active' },
      { trainerId: 'B', clientId: 'c_shared', status: 'active' },
    ]);
    await db.insert(incomes).values([
      {
        id: 'incA',
        trainerId: 'A',
        category: 'Разовая тренировка',
        amount: 1000,
        date: '2026-06-01',
        clientId: 'c_shared',
        note: null,
      },
      {
        id: 'incB',
        trainerId: 'B',
        category: 'Разовая тренировка',
        amount: 2000,
        date: '2026-06-02',
        clientId: 'c_shared',
        note: null,
      },
    ]);
    await db.insert(paymentPackages).values({
      id: 'pkgB',
      trainerId: 'B',
      clientId: 'c_shared',
      kind: 'package',
      lessonsPaid: 5,
      pricePerLesson: 1000,
      totalPaid: 5000,
      startsAt: '2026-06-01',
      status: 'active',
      tags: [],
    });

    expect(await repo.unlink('A', 'c_shared', () => 'inc-from-A')).toBe(true);

    // доход тренера B не тронут
    const [incB] = await db.select().from(incomes).where(eq(incomes.id, 'incB'));
    expect(incB?.clientId).toBe('c_shared');
    expect(incB?.note).toBeNull();

    // пакет тренера B не удалён и не сконвертирован
    const pkgsB = await db.select().from(paymentPackages).where(eq(paymentPackages.id, 'pkgB'));
    expect(pkgsB).toHaveLength(1);

    // связь B—клиент цела
    const linkB = await db
      .select()
      .from(trainerClients)
      .where(and(eq(trainerClients.trainerId, 'B'), eq(trainerClients.clientId, 'c_shared')));
    expect(linkB).toHaveLength(1);

    // связь A—клиент разорвана
    const linkA = await db
      .select()
      .from(trainerClients)
      .where(and(eq(trainerClients.trainerId, 'A'), eq(trainerClients.clientId, 'c_shared')));
    expect(linkA).toHaveLength(0);
  });
});
