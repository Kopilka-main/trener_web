import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { buildApp } from '../../app.js';
import { createDb } from '../../db/client.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('client-app-trainer (isolation)', () => {
  const { db, sql: pg } = createDb(url!);
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    await db.execute(sql`DELETE FROM client_sessions_auth`);
    await db.execute(sql`DELETE FROM client_accounts`);
    await db.execute(sql`DELETE FROM sessions_auth`);
    await db.execute(sql`DELETE FROM trainer_clients`);
    await db.execute(sql`DELETE FROM clients`);
    await db.execute(sql`DELETE FROM trainers`);
    app = await buildApp({ db, cookieSecret: 'x'.repeat(40), isProd: false });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await pg.end();
  });

  function clientSid(res: Awaited<ReturnType<typeof app.inject>>): string {
    const c = res.cookies.find((ck) => ck.name === 'client_sid');
    if (!c) throw new Error('нет client_sid');
    return c.value;
  }
  function trainerSid(res: Awaited<ReturnType<typeof app.inject>>): string {
    const c = res.cookies.find((ck) => ck.name === 'sid');
    if (!c) throw new Error('нет sid');
    return c.value;
  }

  it('публичный профиль тренера без email; 409 до привязки; 401 без сессии', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/client/auth/register',
      payload: { email: 'tr-card@b.co', password: 'longenough1', firstName: 'К', lastName: 'Л' },
    });
    const accId = reg.json<{ account: { id: string } }>().account.id;
    const cSid = clientSid(reg);

    const before = await app.inject({
      method: 'GET',
      url: '/api/client/trainer',
      cookies: { client_sid: cSid },
    });
    expect(before.statusCode).toBe(409);

    const regT = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'thecoach@b.co',
        password: 'longenough1',
        firstName: 'Иван',
        lastName: 'Тренеров',
      },
    });
    const tSid = trainerSid(regT);
    await app.inject({
      method: 'PATCH',
      url: '/api/auth/me',
      cookies: { sid: tSid },
      payload: { title: 'Силовой тренер', bio: 'КМС по пауэрлифтингу' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/clients',
      cookies: { sid: tSid },
      payload: { firstName: 'Кли', lastName: 'Ент', accountId: accId },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/client/trainer',
      cookies: { client_sid: cSid },
    });
    expect(res.statusCode).toBe(200);
    const t = res.json<{ trainer: Record<string, unknown> }>().trainer;
    expect(t.firstName).toBe('Иван');
    expect(t.lastName).toBe('Тренеров');
    expect(t.title).toBe('Силовой тренер');
    expect(t.bio).toBe('КМС по пауэрлифтингу');
    expect(t.email).toBeUndefined();
    expect(t.passwordHash).toBeUndefined();

    const noAuth = await app.inject({ method: 'GET', url: '/api/client/trainer' });
    expect(noAuth.statusCode).toBe(401);
  });

  it('disconnect: отвязывает клиента (409 после), карточка у тренера сохраняется', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/client/auth/register',
      payload: { email: 'tr-dc@b.co', password: 'longenough1', firstName: 'Д', lastName: 'К' },
    });
    const accId = reg.json<{ account: { id: string } }>().account.id;
    const cSid = clientSid(reg);

    const regT = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'coach-dc@b.co',
        password: 'longenough1',
        firstName: 'Пётр',
        lastName: 'Т',
      },
    });
    const tSid = trainerSid(regT);
    const cli = await app.inject({
      method: 'POST',
      url: '/api/clients',
      cookies: { sid: tSid },
      payload: { firstName: 'Кли', lastName: 'Ент', accountId: accId },
    });
    const clientId = cli.json<{ client: { id: string } }>().client.id;

    // До отключения — клиент видит тренера.
    const linked = await app.inject({
      method: 'GET',
      url: '/api/client/trainer',
      cookies: { client_sid: cSid },
    });
    expect(linked.statusCode).toBe(200);

    // Отключение.
    const dc = await app.inject({
      method: 'POST',
      url: '/api/client/trainer/disconnect',
      cookies: { client_sid: cSid },
    });
    expect(dc.statusCode).toBe(200);

    // После — клиент уже не привязан (409).
    const after = await app.inject({
      method: 'GET',
      url: '/api/client/trainer',
      cookies: { client_sid: cSid },
    });
    expect(after.statusCode).toBe(409);

    // Карточка клиента у тренера сохранилась (данные не сброшены) — лишь снята привязка аккаунта.
    const roster = await app.inject({
      method: 'GET',
      url: '/api/clients',
      cookies: { sid: tSid },
    });
    expect(roster.statusCode).toBe(200);
    const found = roster
      .json<{ clients: { id: string; accountId: string | null }[] }>()
      .clients.find((c) => c.id === clientId);
    expect(found).toBeTruthy();
    expect(found?.accountId).toBeNull();

    // Повторный disconnect — уже 409 (нет активной привязки).
    const again = await app.inject({
      method: 'POST',
      url: '/api/client/trainer/disconnect',
      cookies: { client_sid: cSid },
    });
    expect(again.statusCode).toBe(409);
  });
});
