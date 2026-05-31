import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { makeAuthRepo } from './auth.repo.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('auth.repo (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  const repo = makeAuthRepo(db);

  beforeAll(async () => {
    await db.execute(sql`DELETE FROM sessions_auth`);
    await db.execute(sql`DELETE FROM trainers`);
  });
  afterAll(async () => {
    await pg.end();
  });

  it('создаёт тренера и находит по email', async () => {
    await repo.createTrainer({
      id: 't1',
      email: 'a@b.co',
      passwordHash: 'h',
      firstName: 'И',
      lastName: 'Т',
    });
    const found = await repo.findTrainerByEmail('a@b.co');
    expect(found?.id).toBe('t1');
    expect(await repo.findTrainerByEmail('nope@b.co')).toBeNull();
  });

  it('создаёт, находит и удаляет сессию', async () => {
    await repo.createSession({
      id: 's1',
      trainerId: 't1',
      expiresAt: new Date(Date.now() + 3600_000),
    });
    expect((await repo.findSession('s1'))?.trainerId).toBe('t1');
    await repo.deleteSession('s1');
    expect(await repo.findSession('s1')).toBeNull();
  });
});
