import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { buildApp } from '../../app.js';
import { createDb } from '../../db/client.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('client-app-packages (isolation)', () => {
  const { db, sql: pg } = createDb(url!);
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    await db.execute(sql`DELETE FROM payment_packages`);
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
    const res = await app.inject({ method: 'GET', url: '/api/client/packages' });
    expect(res.statusCode).toBe(401);
  });

  it('непривязанный клиент → 409', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/client/auth/register',
      payload: { email: 'pk-unl@b.co', password: 'longenough1', firstName: 'К', lastName: 'Л' },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/client/packages',
      cookies: { client_sid: clientSid(reg) },
    });
    expect(res.statusCode).toBe(409);
  });

  it('привязанный клиент видит свой пакет', async () => {
    const regA = await app.inject({
      method: 'POST',
      url: '/api/client/auth/register',
      payload: { email: 'pk-a@b.co', password: 'longenough1', firstName: 'А', lastName: 'А' },
    });
    const accA = regA.json<{ account: { id: string } }>().account.id;
    const sidA = clientSid(regA);

    const regT = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'pk-t@b.co', password: 'longenough1', firstName: 'Т', lastName: 'Р' },
    });
    const tSid = trainerSid(regT);
    const cli = await app.inject({
      method: 'POST',
      url: '/api/clients',
      cookies: { sid: tSid },
      payload: { firstName: 'Кли', lastName: 'А', accountId: accA },
    });
    const clientId = cli.json<{ client: { id: string } }>().client.id;

    await app.inject({
      method: 'POST',
      url: `/api/clients/${clientId}/packages`,
      cookies: { sid: tSid },
      payload: {
        lessonsPaid: 10,
        pricePerLesson: 1000,
        totalPaid: 10000,
        startsAt: '2026-06-01',
        workoutType: 'Персональные',
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/client/packages',
      cookies: { client_sid: sidA },
    });
    expect(res.statusCode).toBe(200);
    const pkgs = res.json<{ packages: { lessonsPaid: number; status: string }[] }>().packages;
    expect(pkgs.length).toBe(1);
    expect(pkgs[0]?.lessonsPaid).toBe(10);
    expect(pkgs[0]?.status).toBe('active');
  });
});
