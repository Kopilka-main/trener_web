import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { trainers } from '../../db/schema.js';
import { makeClientsRepo } from './clients.repo.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('clients.repo (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  const repo = makeClientsRepo(db);

  beforeEach(async () => {
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
});
