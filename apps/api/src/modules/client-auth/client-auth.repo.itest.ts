import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { makeClientAuthRepo } from './client-auth.repo.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('client-auth.repo (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  const repo = makeClientAuthRepo(db);

  beforeAll(async () => {
    await db.execute(sql`DELETE FROM client_sessions_auth`);
    await db.execute(sql`DELETE FROM client_accounts`);
  });
  afterAll(async () => {
    await pg.end();
  });

  it('создаёт аккаунт и находит по email и id', async () => {
    await repo.createAccount({
      id: 'ca1',
      email: 'c@b.co',
      passwordHash: 'h',
      firstName: 'И',
      lastName: 'К',
    });
    expect((await repo.findAccountByEmail('c@b.co'))?.id).toBe('ca1');
    expect((await repo.findAccountById('ca1'))?.email).toBe('c@b.co');
    expect(await repo.findAccountByEmail('nope@b.co')).toBeNull();
  });

  it('создаёт, находит и удаляет сессию', async () => {
    await repo.createSession({
      id: 'cs1',
      clientAccountId: 'ca1',
      expiresAt: new Date(Date.now() + 3600_000),
    });
    expect((await repo.findSession('cs1'))?.clientAccountId).toBe('ca1');
    await repo.deleteSession('cs1');
    expect(await repo.findSession('cs1')).toBeNull();
  });
});
