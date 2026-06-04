import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { buildApp } from '../../app.js';
import { createDb } from '../../db/client.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('client-app-exercises (isolation)', () => {
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

  function clientCookie(res: Awaited<ReturnType<typeof app.inject>>): string {
    const c = res.cookies.find((ck) => ck.name === 'client_sid');
    if (!c) throw new Error('нет client_sid');
    return `client_sid=${c.value}`;
  }
  function trainerCookie(res: Awaited<ReturnType<typeof app.inject>>): string {
    const c = res.cookies.find((ck) => ck.name === 'sid');
    if (!c) throw new Error('нет sid');
    return `sid=${c.value}`;
  }

  it('без сессии → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/client/exercises' });
    expect(res.statusCode).toBe(401);
  });

  it('зарегистрированный, но непривязанный клиент → 409', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/client/auth/register',
      payload: { email: 'unlinked@b.co', password: 'longenough1', firstName: 'U', lastName: 'L' },
    });
    expect(reg.statusCode).toBe(201);
    const cookie = clientCookie(reg);

    const res = await app.inject({
      method: 'GET',
      url: '/api/client/exercises',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<{ code: string }>().code).toBe('NOT_LINKED');
  });

  it('привязанный клиент → 200 и упражнение тренера видно', async () => {
    // Регистрация клиента
    const regC = await app.inject({
      method: 'POST',
      url: '/api/client/auth/register',
      payload: { email: 'ex.client@b.co', password: 'longenough1', firstName: 'C', lastName: 'L' },
    });
    expect(regC.statusCode).toBe(201);
    const accId = regC.json<{ account: { id: string } }>().account.id;
    const cookieC = clientCookie(regC);

    // Регистрация тренера
    const regT = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'ex.trainer@b.co', password: 'longenough1', firstName: 'T', lastName: 'R' },
    });
    expect(regT.statusCode).toBe(201);
    const cookieT = trainerCookie(regT);

    // Привязка клиента к тренеру
    const cli = await app.inject({
      method: 'POST',
      url: '/api/clients',
      headers: { cookie: cookieT },
      payload: { firstName: 'Кли', lastName: 'Ент', accountId: accId },
    });
    expect(cli.statusCode).toBe(201);

    // Тренер создаёт упражнение
    const ex = await app.inject({
      method: 'POST',
      url: '/api/exercises',
      headers: { cookie: cookieT },
      payload: { name: 'Приседания', category: 'Ноги' },
    });
    expect(ex.statusCode).toBe(201);
    const exerciseId = ex.json<{ exercise: { id: string; name: string } }>().exercise.id;

    // Клиент видит упражнение тренера
    const res = await app.inject({
      method: 'GET',
      url: '/api/client/exercises',
      headers: { cookie: cookieC },
    });
    expect(res.statusCode).toBe(200);
    const exercises = res.json<{ exercises: { id: string; name: string }[] }>().exercises;
    const found = exercises.find((e) => e.id === exerciseId);
    expect(found).toBeDefined();
    expect(found?.name).toBe('Приседания');
  });
});
