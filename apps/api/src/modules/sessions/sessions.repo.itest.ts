import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { trainers, clients, trainerClients } from '../../db/schema.js';
import { makeSessionsRepo } from './sessions.repo.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('sessions.repo (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  const repo = makeSessionsRepo(db);

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM sessions`);
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

  function base(over: Partial<Parameters<typeof repo.create>[0]> = {}) {
    return {
      id: 's1',
      trainerId: 'A',
      clientId: 'c1',
      date: '2026-06-10',
      startTime: '10:00',
      durationMin: 60,
      isOnline: false,
      ...over,
    };
  }

  it('isClientLinked: связь c1↔A true, c2↔A false', async () => {
    expect(await repo.isClientLinked('A', 'c1')).toBe(true);
    expect(await repo.isClientLinked('A', 'c2')).toBe(false);
  });

  it('create + getForTrainer: isOnline int→bool, scoped', async () => {
    const created = await repo.create(base({ isOnline: true, title: 'Утро' }));
    expect(created.isOnline).toBe(1); // в строке БД int
    const got = await repo.getForTrainer('A', 's1');
    expect(got?.title).toBe('Утро');
    // Чужой тренер не видит занятие A.
    expect(await repo.getForTrainer('B', 's1')).toBeNull();
  });

  it('listByTrainer: фильтр по диапазону дат, сорт по date, startTime', async () => {
    await repo.create(base({ id: 's1', date: '2026-06-10', startTime: '12:00' }));
    await repo.create(base({ id: 's2', date: '2026-06-10', startTime: '09:00' }));
    await repo.create(base({ id: 's3', date: '2026-06-15', startTime: '10:00' }));
    await repo.create(base({ id: 's4', date: '2026-06-20', startTime: '10:00' }));

    // Без фильтра — все 4, в порядке date,startTime.
    const all = await repo.listByTrainer('A');
    expect(all.map((r) => r.id)).toEqual(['s2', 's1', 's3', 's4']);

    // Диапазон [2026-06-10..2026-06-15] — s2,s1,s3.
    const range = await repo.listByTrainer('A', { from: '2026-06-10', to: '2026-06-15' });
    expect(range.map((r) => r.id)).toEqual(['s2', 's1', 's3']);

    // Только from.
    const fromOnly = await repo.listByTrainer('A', { from: '2026-06-15' });
    expect(fromOnly.map((r) => r.id)).toEqual(['s3', 's4']);

    // Только to.
    const toOnly = await repo.listByTrainer('A', { to: '2026-06-10' });
    expect(toOnly.map((r) => r.id)).toEqual(['s2', 's1']);

    // B не видит занятия A.
    expect(await repo.listByTrainer('B')).toHaveLength(0);
  });

  it('update/delete scoped: чужой тренер не трогает (null/false)', async () => {
    await repo.create(base());
    // B не правит/не удаляет занятие A.
    expect(await repo.update('B', 's1', { title: 'Hacked' })).toBeNull();
    expect(await repo.delete('B', 's1')).toBe(false);
    // A — может: смена статуса и isOnline.
    const upd = await repo.update('A', 's1', { status: 'completed', isOnline: true });
    expect(upd?.status).toBe('completed');
    expect(upd?.isOnline).toBe(1);
    expect(await repo.delete('A', 's1')).toBe(true);
    expect(await repo.getForTrainer('A', 's1')).toBeNull();
  });
});
