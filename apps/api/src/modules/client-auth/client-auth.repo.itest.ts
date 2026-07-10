import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { makeClientAuthRepo } from './client-auth.repo.js';
import { clients, trainerClients, trainers } from '../../db/schema.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('client-auth.repo (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  const repo = makeClientAuthRepo(db);

  beforeAll(async () => {
    await db.execute(sql`DELETE FROM client_sessions_auth`);
    await db.execute(sql`DELETE FROM trainer_clients`);
    await db.execute(sql`DELETE FROM clients`);
    await db.execute(sql`DELETE FROM client_accounts`);
    await db.execute(sql`DELETE FROM trainers`);
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

  it('findScopeByAccountId возвращает {trainerId, clientId} для привязанного аккаунта', async () => {
    await repo.createAccount({
      id: 'ca-link',
      email: 'link@b.co',
      passwordHash: 'h',
      firstName: 'И',
      lastName: 'К',
    });
    await db.insert(trainers).values({
      id: 'tr1',
      email: 'tr1@b.co',
      passwordHash: 'h',
      firstName: 'Т',
      lastName: 'Р',
    });
    await db
      .insert(clients)
      .values({ id: 'cl1', firstName: 'К', lastName: 'Л', accountId: 'ca-link' });
    await db.insert(trainerClients).values({ trainerId: 'tr1', clientId: 'cl1', status: 'active' });
    expect(await repo.findScopeByAccountId('ca-link')).toEqual({
      trainerId: 'tr1',
      clientId: 'cl1',
    });
  });

  it('findScopeByAccountId возвращает null, если активной связи нет', async () => {
    await repo.createAccount({
      id: 'ca-noactive',
      email: 'noact@b.co',
      passwordHash: 'h',
      firstName: 'И',
      lastName: 'К',
    });
    await db.insert(trainers).values({
      id: 'tr2',
      email: 'tr2@b.co',
      passwordHash: 'h',
      firstName: 'Т',
      lastName: 'Р',
    });
    await db
      .insert(clients)
      .values({ id: 'cl2', firstName: 'К', lastName: 'Л', accountId: 'ca-noactive' });
    await db
      .insert(trainerClients)
      .values({ trainerId: 'tr2', clientId: 'cl2', status: 'archived' });
    expect(await repo.findScopeByAccountId('ca-noactive')).toBeNull();
  });

  it('findScopeByAccountId возвращает null для несуществующего аккаунта', async () => {
    expect(await repo.findScopeByAccountId('ghost')).toBeNull();
  });

  it('accountExists различает существующий и отсутствующий аккаунт', async () => {
    await repo.createAccount({
      id: 'ca-exist',
      email: 'exist@b.co',
      passwordHash: 'h',
      firstName: 'И',
      lastName: 'К',
    });
    expect(await repo.accountExists('ca-exist')).toBe(true);
    expect(await repo.accountExists('nope')).toBe(false);
  });

  it('updateAccount меняет профильные поля', async () => {
    await repo.createAccount({
      id: 'ca-upd',
      email: 'upd@b.co',
      passwordHash: 'h',
      firstName: 'Имя',
      lastName: 'Фам',
    });
    const updated = await repo.updateAccount('ca-upd', {
      firstName: 'Новое',
      birthDate: '1990-05-20',
      birthYear: 1990,
      contacts: [{ type: 'Телефон', value: '+7900' }],
      bio: 'Цель — присед 100',
    });
    expect(updated?.firstName).toBe('Новое');
    expect(updated?.birthDate).toBe('1990-05-20');
    expect(updated?.birthYear).toBe(1990);
    expect(updated?.contacts).toEqual([{ type: 'Телефон', value: '+7900' }]);
    expect(updated?.bio).toBe('Цель — присед 100');
  });
});
