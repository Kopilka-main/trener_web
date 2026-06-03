import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { buildApp } from '../../app.js';
import { createDb } from '../../db/client.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('client-app-measurements (isolation)', () => {
  const { db, sql: pg } = createDb(url!);
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    await db.execute(sql`DELETE FROM measurements`);
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

  it('без client_sid → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/client/measurements' });
    expect(res.statusCode).toBe(401);
  });

  it('непривязанный клиент → 409', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/client/auth/register',
      payload: { email: 'm-unl@b.co', password: 'longenough1', firstName: 'К', lastName: 'Л' },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/client/measurements',
      cookies: { client_sid: clientSid(reg) },
    });
    expect(res.statusCode).toBe(409);
  });

  it('клиент ведёт свои замеры; чужой замер недоступен (404)', async () => {
    // Клиент A
    const regA = await app.inject({
      method: 'POST',
      url: '/api/client/auth/register',
      payload: { email: 'm-a@b.co', password: 'longenough1', firstName: 'А', lastName: 'А' },
    });
    const accA = regA.json<{ account: { id: string } }>().account.id;
    const sidA = clientSid(regA);

    // Тренер + два клиента (A привязан к аккаунту, B — чужой)
    const regT = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'm-t@b.co', password: 'longenough1', firstName: 'Т', lastName: 'Р' },
    });
    const tSid = trainerSid(regT);
    const cliA = await app.inject({
      method: 'POST',
      url: '/api/clients',
      cookies: { sid: tSid },
      payload: { firstName: 'Кли', lastName: 'А', accountId: accA },
    });
    void cliA.json<{ client: { id: string } }>().client.id;
    const cliB = await app.inject({
      method: 'POST',
      url: '/api/clients',
      cookies: { sid: tSid },
      payload: { firstName: 'Кли', lastName: 'Б' },
    });
    const clientBId = cliB.json<{ client: { id: string } }>().client.id;

    // Замер клиента B создаёт тренер
    const mB = await app.inject({
      method: 'POST',
      url: `/api/clients/${clientBId}/measurements`,
      cookies: { sid: tSid },
      payload: { date: '2026-05-01', weightKg: 80 },
    });
    const mBId = mB.json<{ measurement: { id: string } }>().measurement.id;

    // Клиент A создаёт свой замер
    const created = await app.inject({
      method: 'POST',
      url: '/api/client/measurements',
      cookies: { client_sid: sidA },
      payload: { date: '2026-05-02', weightKg: 70, waistCm: 80 },
    });
    expect(created.statusCode).toBe(201);
    const mAId = created.json<{ measurement: { id: string } }>().measurement.id;

    // Список клиента A — только его замер
    const list = await app.inject({
      method: 'GET',
      url: '/api/client/measurements',
      cookies: { client_sid: sidA },
    });
    expect(list.statusCode).toBe(200);
    const ids = list.json<{ measurements: { id: string }[] }>().measurements.map((m) => m.id);
    expect(ids).toEqual([mAId]);

    // Правка своего — ок
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/client/measurements/${mAId}`,
      cookies: { client_sid: sidA },
      payload: { weightKg: 69 },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json<{ measurement: { weightKg: number } }>().measurement.weightKg).toBe(69);

    // Правка чужого (B) → 404
    const forbidden = await app.inject({
      method: 'PATCH',
      url: `/api/client/measurements/${mBId}`,
      cookies: { client_sid: sidA },
      payload: { weightKg: 1 },
    });
    expect(forbidden.statusCode).toBe(404);

    // Удаление чужого (B) → 404
    const delForbidden = await app.inject({
      method: 'DELETE',
      url: `/api/client/measurements/${mBId}`,
      cookies: { client_sid: sidA },
    });
    expect(delForbidden.statusCode).toBe(404);

    // Удаление своего — ок
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/client/measurements/${mAId}`,
      cookies: { client_sid: sidA },
    });
    expect(del.statusCode).toBe(200);
  });
});
