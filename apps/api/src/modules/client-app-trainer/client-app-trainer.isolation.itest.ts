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
});
