import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { trainers, clients, trainerClients } from '../../db/schema.js';
import { makePackagesRepo, type CreatePackageInput } from './packages.repo.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('packages.repo (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  const repo = makePackagesRepo(db);

  const input: CreatePackageInput = {
    id: 'p1',
    lessonsPaid: 10,
    pricePerLesson: 1500,
    totalPaid: 15000,
    startsAt: '2026-06-01',
    workoutType: 'Силовая',
    note: 'нал',
  };

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM payment_packages`);
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

  it('create вставляет пакет со статусом active и полями', async () => {
    const p = await repo.create('A', 'c1', input);
    expect(p.id).toBe('p1');
    expect(p.clientId).toBe('c1');
    expect(p.status).toBe('active');
    expect(p.lessonsPaid).toBe(10);
    expect(p.pricePerLesson).toBe(1500);
    expect(p.totalPaid).toBe(15000);
    expect(p.workoutType).toBe('Силовая');
    expect(p.note).toBe('нал');
    expect(p.createdAt).toBeInstanceOf(Date);
  });

  it('getForTrainer резолвит в scope пары; null если не принадлежит паре', async () => {
    await repo.create('A', 'c1', input);
    expect((await repo.getForTrainer('A', 'c1', 'p1'))?.id).toBe('p1');
    expect(await repo.getForTrainer('A', 'c2', 'p1')).toBeNull();
    expect(await repo.getForTrainer('B', 'c1', 'p1')).toBeNull();
  });

  it('listForClient возвращает пакеты пары (desc createdAt); чужой — пусто', async () => {
    await repo.create('A', 'c1', { ...input, id: 'p1' });
    await repo.create('A', 'c1', { ...input, id: 'p2' });
    const list = await repo.listForClient('A', 'c1');
    expect(list).toHaveLength(2);
    expect(list.map((p) => p.id)).toContain('p1');
    expect(await repo.listForClient('B', 'c1')).toEqual([]);
  });

  it('update меняет поля и статус в scope пары; чужой → null', async () => {
    await repo.create('A', 'c1', input);
    const upd = await repo.update('A', 'c1', 'p1', { status: 'closed', lessonsPaid: 8 });
    expect(upd?.status).toBe('closed');
    expect(upd?.lessonsPaid).toBe(8);
    // чужой тренер не находит → null (не мутирует)
    expect(await repo.update('B', 'c1', 'p1', { status: 'cancelled' })).toBeNull();
    expect((await repo.getForTrainer('A', 'c1', 'p1'))?.status).toBe('closed');
  });

  it('update с пустым patch возвращает текущую строку; null если нет', async () => {
    await repo.create('A', 'c1', input);
    expect((await repo.update('A', 'c1', 'p1', {}))?.id).toBe('p1');
    expect(await repo.update('A', 'c1', 'missing', {})).toBeNull();
  });

  it('remove удаляет в scope пары; чужой не удаляет', async () => {
    await repo.create('A', 'c1', input);
    expect(await repo.remove('B', 'c1', 'p1')).toBe(false);
    expect(await repo.remove('A', 'c1', 'p1')).toBe(true);
    expect(await repo.getForTrainer('A', 'c1', 'p1')).toBeNull();
  });
});
