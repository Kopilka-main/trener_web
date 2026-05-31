import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { buildApp } from '../../app.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('clients routes (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  let app: Awaited<ReturnType<typeof buildApp>>;
  let sid: string;

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM trainer_clients`);
    await db.execute(sql`DELETE FROM clients`);
    await db.execute(sql`DELETE FROM sessions_auth`);
    await db.execute(sql`DELETE FROM trainers`);
    app = await buildApp({ db, cookieSecret: 'x'.repeat(40), isProd: false });
    const reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'a@b.co', password: 'longenough1', firstName: 'Тр', lastName: 'Ен' },
    });
    sid = reg.cookies.find((c) => c.name === 'sid')!.value;
  });
  afterAll(async () => {
    await pg.end();
  });

  it('CRUD: create → list → get → patch(archive) → delete', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/clients',
      cookies: { sid },
      payload: { firstName: 'Алина', lastName: 'Кузнецова', phone: '+7900', notes: 'новичок' },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json<{ client: { id: string } }>().client.id;

    const list = await app.inject({ method: 'GET', url: '/api/clients', cookies: { sid } });
    expect(list.json<{ clients: unknown[] }>().clients).toHaveLength(1);

    const got = await app.inject({ method: 'GET', url: `/api/clients/${id}`, cookies: { sid } });
    expect(got.statusCode).toBe(200);
    expect(got.json<{ client: { firstName: string } }>().client.firstName).toBe('Алина');

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/clients/${id}`,
      cookies: { sid },
      payload: { status: 'archived', notes: 'пауза' },
    });
    expect(patched.json<{ client: { status: string } }>().client.status).toBe('archived');

    const del = await app.inject({ method: 'DELETE', url: `/api/clients/${id}`, cookies: { sid } });
    expect(del.statusCode).toBe(200);

    const after = await app.inject({ method: 'GET', url: `/api/clients/${id}`, cookies: { sid } });
    expect(after.statusCode).toBe(404); // связь разорвана
  });

  it('создание без auth → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/clients',
      payload: { firstName: 'X', lastName: 'Y' },
    });
    expect(res.statusCode).toBe(401);
  });
});
