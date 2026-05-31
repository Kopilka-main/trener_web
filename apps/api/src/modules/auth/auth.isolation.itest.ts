import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { buildApp } from '../../app.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('auth isolation (integration)', () => {
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

  it('/me без cookie → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('/me с мусорным cookie → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { sid: 'garbage-token' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('после logout сессия больше не действует', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'iso@b.co', password: 'longenough1', firstName: 'И', lastName: 'Т' },
    });
    const sid = reg.cookies.find((c) => c.name === 'sid')!.value;
    await app.inject({ method: 'POST', url: '/api/auth/logout', cookies: { sid } });
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { sid } });
    expect(me.statusCode).toBe(401);
  });
});
