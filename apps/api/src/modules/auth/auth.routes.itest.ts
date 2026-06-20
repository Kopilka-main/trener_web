import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { buildApp } from '../../app.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('auth routes (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    await db.execute(sql`DELETE FROM sessions_auth`);
    await db.execute(sql`DELETE FROM trainers`);
    app = await buildApp({ db, cookieSecret: 'x'.repeat(40), isProd: false });
  });
  afterAll(async () => {
    await app.close();
    await pg.end();
  });

  it('регистрация → cookie → /me работает', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'a@b.co', password: 'longenough1', firstName: 'И', lastName: 'Т' },
    });
    expect(reg.statusCode).toBe(201);
    const cookieHeader = reg.cookies.find((c) => c.name === 'sid');
    expect(cookieHeader?.httpOnly).toBe(true);
    expect(cookieHeader?.sameSite?.toLowerCase()).toBe('lax');
    // isProd:false → secure НЕ установлен
    expect(cookieHeader?.secure).toBeFalsy();

    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { sid: cookieHeader!.value },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json<{ trainer: { email: string } }>().trainer.email).toBe('a@b.co');
  });

  it('регистрация → token в теле → Bearer на /me (нативные клиенты)', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'bearer@b.co', password: 'longenough1', firstName: 'И', lastName: 'Т' },
    });
    expect(reg.statusCode).toBe(201);
    const token = reg.json<{ token: string }>().token;
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(10);

    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json<{ trainer: { email: string } }>().trainer.email).toBe('bearer@b.co');

    // Без cookie и без заголовка → 401.
    const anon = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(anon.statusCode).toBe(401);
  });

  it('повторная регистрация того же email → 409', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'a@b.co', password: 'longenough1', firstName: 'И', lastName: 'Т' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('логин верным паролем → 200, неверным → 401', async () => {
    const ok = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'a@b.co', password: 'longenough1' },
    });
    expect(ok.statusCode).toBe(200);
    const bad = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'a@b.co', password: 'wrong-pass' },
    });
    expect(bad.statusCode).toBe(401);
  });

  it('isProd:true → cookie помечен secure + sameSite lax', async () => {
    const prodApp = await buildApp({ db, cookieSecret: 'x'.repeat(40), isProd: true });
    try {
      const reg = await prodApp.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: 'secure@b.co', password: 'longenough1', firstName: 'И', lastName: 'Т' },
      });
      expect(reg.statusCode).toBe(201);
      const cookie = reg.cookies.find((c) => c.name === 'sid');
      expect(cookie?.secure).toBe(true);
      expect(cookie?.sameSite?.toLowerCase()).toBe('lax');
    } finally {
      await prodApp.close();
    }
  });
});
