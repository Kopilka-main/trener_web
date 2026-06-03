import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { buildApp } from '../../app.js';
import { createDb } from '../../db/client.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('client-auth (isolation)', () => {
  const { db, sql: pg } = createDb(url!);
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    await db.execute(sql`DELETE FROM client_sessions_auth`);
    await db.execute(sql`DELETE FROM client_accounts`);
    app = await buildApp({ db, cookieSecret: 'x'.repeat(40), isProd: false });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await pg.end();
  });

  function clientSidFrom(res: Awaited<ReturnType<typeof app.inject>>): string {
    const c = res.cookies.find((ck) => ck.name === 'client_sid');
    if (!c) throw new Error('нет client_sid');
    return c.value;
  }

  it('me без cookie → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/client/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('register → me возвращает аккаунт и link=null', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/client/auth/register',
      payload: { email: 'iso@b.co', password: 'longenough1', firstName: 'И', lastName: 'К' },
    });
    expect(reg.statusCode).toBe(201);
    const sid = clientSidFrom(reg);
    const me = await app.inject({
      method: 'GET',
      url: '/api/client/auth/me',
      cookies: { client_sid: sid },
    });
    expect(me.statusCode).toBe(200);
    const body = me.json<{ account: { email: string }; link: unknown }>();
    expect(body.account.email).toBe('iso@b.co');
    expect(body.link).toBeNull();
  });

  it('повторный register того же email → 409', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/client/auth/register',
      payload: { email: 'iso@b.co', password: 'longenough1', firstName: 'И', lastName: 'К' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('PATCH /me обновляет профиль; без сессии → 401', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/client/auth/register',
      payload: { email: 'prof@b.co', password: 'longenough1', firstName: 'И', lastName: 'К' },
    });
    const sid = clientSidFrom(reg);
    const patch = await app.inject({
      method: 'PATCH',
      url: '/api/client/auth/me',
      cookies: { client_sid: sid },
      payload: { firstName: 'Пётр', birthDate: '1992-03-10', bio: 'Набрать массу' },
    });
    expect(patch.statusCode).toBe(200);
    const me = await app.inject({
      method: 'GET',
      url: '/api/client/auth/me',
      cookies: { client_sid: sid },
    });
    const body = me.json<{
      account: { firstName: string; birthDate: string | null; bio: string | null };
    }>();
    expect(body.account.firstName).toBe('Пётр');
    expect(body.account.birthDate).toBe('1992-03-10');
    expect(body.account.bio).toBe('Набрать массу');

    const noAuth = await app.inject({
      method: 'PATCH',
      url: '/api/client/auth/me',
      payload: { firstName: 'X' },
    });
    expect(noAuth.statusCode).toBe(401);
  });

  it('сессия клиента A не даёт доступ под другим токеном', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/client/auth/register',
      payload: { email: 'b2@b.co', password: 'longenough1', firstName: 'Б', lastName: 'К' },
    });
    const sidB = clientSidFrom(reg);
    const meB = await app.inject({
      method: 'GET',
      url: '/api/client/auth/me',
      cookies: { client_sid: sidB },
    });
    expect(meB.json<{ account: { email: string } }>().account.email).toBe('b2@b.co');
    const bogus = await app.inject({
      method: 'GET',
      url: '/api/client/auth/me',
      cookies: { client_sid: 'not-a-real-token' },
    });
    expect(bogus.statusCode).toBe(401);
  });
});
