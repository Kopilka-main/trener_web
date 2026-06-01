import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { trainers, clients, trainerClients } from '../../db/schema.js';
import { makeMeasurementsRepo, type CreateMeasurementInput } from './measurements.repo.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('measurements.repo (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  const repo = makeMeasurementsRepo(db);

  const input: CreateMeasurementInput = {
    id: 'm1',
    date: '2026-06-01',
    weightKg: 80,
    bodyFatPct: 18,
    chestCm: 100,
    waistCm: 85,
    hipsCm: 95,
    note: 'утро',
  };

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM measurements`);
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

  it('create вставляет замер со всеми полями', async () => {
    const m = await repo.create('A', 'c1', input);
    expect(m.id).toBe('m1');
    expect(m.clientId).toBe('c1');
    expect(m.date).toBe('2026-06-01');
    expect(m.weightKg).toBe(80);
    expect(m.bodyFatPct).toBe(18);
    expect(m.chestCm).toBe(100);
    expect(m.waistCm).toBe(85);
    expect(m.hipsCm).toBe(95);
    expect(m.note).toBe('утро');
    expect(m.createdAt).toBeInstanceOf(Date);
  });

  it('create с опущенными метриками сохраняет null', async () => {
    const m = await repo.create('A', 'c1', { id: 'm2', date: '2026-06-02' });
    expect(m.weightKg).toBeNull();
    expect(m.bodyFatPct).toBeNull();
    expect(m.chestCm).toBeNull();
    expect(m.waistCm).toBeNull();
    expect(m.hipsCm).toBeNull();
    expect(m.note).toBeNull();
  });

  it('getForTrainer резолвит в scope пары; null если не принадлежит паре', async () => {
    await repo.create('A', 'c1', input);
    expect((await repo.getForTrainer('A', 'c1', 'm1'))?.id).toBe('m1');
    expect(await repo.getForTrainer('A', 'c2', 'm1')).toBeNull();
    expect(await repo.getForTrainer('B', 'c1', 'm1')).toBeNull();
  });

  it('listForClient возвращает замеры пары, сортируя по date desc; чужой — пусто', async () => {
    await repo.create('A', 'c1', { ...input, id: 'old', date: '2026-05-01' });
    await repo.create('A', 'c1', { ...input, id: 'new', date: '2026-06-01' });
    await repo.create('A', 'c1', { ...input, id: 'mid', date: '2026-05-15' });
    const list = await repo.listForClient('A', 'c1');
    expect(list.map((m) => m.id)).toEqual(['new', 'mid', 'old']);
    expect(await repo.listForClient('B', 'c1')).toEqual([]);
  });

  it('update меняет поля в scope пары; чужой → null (не мутирует)', async () => {
    await repo.create('A', 'c1', input);
    const upd = await repo.update('A', 'c1', 'm1', { weightKg: 78, note: null });
    expect(upd?.weightKg).toBe(78);
    expect(upd?.note).toBeNull();
    expect(await repo.update('B', 'c1', 'm1', { weightKg: 1 })).toBeNull();
    expect((await repo.getForTrainer('A', 'c1', 'm1'))?.weightKg).toBe(78);
  });

  it('update с пустым patch возвращает текущую строку; null если нет', async () => {
    await repo.create('A', 'c1', input);
    expect((await repo.update('A', 'c1', 'm1', {}))?.id).toBe('m1');
    expect(await repo.update('A', 'c1', 'missing', {})).toBeNull();
  });

  it('remove удаляет в scope пары; чужой не удаляет', async () => {
    await repo.create('A', 'c1', input);
    expect(await repo.remove('B', 'c1', 'm1')).toBe(false);
    expect(await repo.remove('A', 'c1', 'm1')).toBe(true);
    expect(await repo.getForTrainer('A', 'c1', 'm1')).toBeNull();
  });
});
