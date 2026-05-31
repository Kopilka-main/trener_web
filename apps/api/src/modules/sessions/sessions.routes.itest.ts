import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { buildApp } from '../../app.js';

const url = process.env.DATABASE_URL;

type ClientResp = { client: { id: string } };
type SessionResp = {
  session: {
    id: string;
    clientId: string;
    date: string;
    startTime: string;
    durationMin: number;
    status: string;
    isOnline: boolean;
    title: string | null;
  };
};

describe.skipIf(!url)('sessions routes (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  let app: Awaited<ReturnType<typeof buildApp>>;
  let sid: string;

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM sessions`);
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

  async function createClient(): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/clients',
      cookies: { sid },
      payload: { firstName: 'Кл', lastName: 'И' },
    });
    return res.json<ClientResp>().client.id;
  }

  it('CRUD: создать клиента+связь → POST занятие → list → get → patch → delete', async () => {
    const cid = await createClient();

    const created = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      cookies: { sid },
      payload: {
        clientId: cid,
        date: '2026-06-10',
        startTime: '10:00',
        durationMin: 90,
        title: 'Утренняя',
        isOnline: false,
      },
    });
    expect(created.statusCode).toBe(201);
    const s = created.json<SessionResp>().session;
    expect(s.durationMin).toBe(90);
    expect(s.status).toBe('planned');
    expect(s.isOnline).toBe(false);
    const id = s.id;

    const list = await app.inject({ method: 'GET', url: '/api/sessions', cookies: { sid } });
    expect(list.json<{ sessions: unknown[] }>().sessions).toHaveLength(1);

    // Фильтр по диапазону дат.
    const inRange = await app.inject({
      method: 'GET',
      url: '/api/sessions?from=2026-06-01&to=2026-06-30',
      cookies: { sid },
    });
    expect(inRange.json<{ sessions: unknown[] }>().sessions).toHaveLength(1);
    const outRange = await app.inject({
      method: 'GET',
      url: '/api/sessions?from=2026-07-01&to=2026-07-31',
      cookies: { sid },
    });
    expect(outRange.json<{ sessions: unknown[] }>().sessions).toHaveLength(0);

    const got = await app.inject({ method: 'GET', url: `/api/sessions/${id}`, cookies: { sid } });
    expect(got.statusCode).toBe(200);
    expect(got.json<SessionResp>().session.title).toBe('Утренняя');

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/sessions/${id}`,
      cookies: { sid },
      payload: { status: 'completed', isOnline: true },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json<SessionResp>().session.status).toBe('completed');
    expect(patched.json<SessionResp>().session.isOnline).toBe(true);

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/sessions/${id}`,
      cookies: { sid },
    });
    expect(del.statusCode).toBe(200);

    const after = await app.inject({
      method: 'GET',
      url: `/api/sessions/${id}`,
      cookies: { sid },
    });
    expect(after.statusCode).toBe(404);
  });

  it('создание на несвязанного клиента → 400 CLIENT_NOT_LINKED', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      cookies: { sid },
      payload: {
        clientId: 'nope',
        date: '2026-06-10',
        startTime: '10:00',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ code: string }>().code).toBe('CLIENT_NOT_LINKED');
  });

  it('создание без auth → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { clientId: 'x', date: '2026-06-10', startTime: '10:00' },
    });
    expect(res.statusCode).toBe(401);
  });
});
