import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { buildApp } from '../../app.js';

const url = process.env.DATABASE_URL;

type ClientResp = { client: { id: string } };
type PackageResp = {
  package: {
    id: string;
    clientId: string;
    lessonsPaid: number;
    pricePerLesson: number;
    totalPaid: number;
    workoutType: string | null;
    startsAt: string;
    status: string;
    note: string | null;
    createdAt: string;
  };
};

describe.skipIf(!url)('packages routes (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  let app: Awaited<ReturnType<typeof buildApp>>;
  let sid: string;

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM payment_packages`);
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

  it('полный CRUD флоу: create → list → get → patch → delete', async () => {
    const cid = await createClient();

    const created = await app.inject({
      method: 'POST',
      url: `/api/clients/${cid}/packages`,
      cookies: { sid },
      payload: {
        lessonsPaid: 10,
        pricePerLesson: 1500,
        totalPaid: 15000,
        startsAt: '2026-06-01',
        workoutType: 'Силовая',
      },
    });
    expect(created.statusCode).toBe(201);
    const p = created.json<PackageResp>().package;
    expect(p.clientId).toBe(cid);
    expect(p.status).toBe('active');
    expect(p.lessonsPaid).toBe(10);
    expect(p.workoutType).toBe('Силовая');
    const pid = p.id;

    const list = await app.inject({
      method: 'GET',
      url: `/api/clients/${cid}/packages`,
      cookies: { sid },
    });
    expect(list.json<{ packages: unknown[] }>().packages).toHaveLength(1);

    const got = await app.inject({
      method: 'GET',
      url: `/api/clients/${cid}/packages/${pid}`,
      cookies: { sid },
    });
    expect(got.statusCode).toBe(200);
    expect(got.json<PackageResp>().package.id).toBe(pid);

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/clients/${cid}/packages/${pid}`,
      cookies: { sid },
      payload: { status: 'closed', note: 'завершён' },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json<PackageResp>().package.status).toBe('closed');
    expect(patched.json<PackageResp>().package.note).toBe('завершён');

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/clients/${cid}/packages/${pid}`,
      cookies: { sid },
    });
    expect(del.statusCode).toBe(200);
    expect(del.json<{ ok: boolean }>().ok).toBe(true);

    const after = await app.inject({
      method: 'GET',
      url: `/api/clients/${cid}/packages/${pid}`,
      cookies: { sid },
    });
    expect(after.statusCode).toBe(404);
  });

  it('get несуществующего пакета → 404', async () => {
    const cid = await createClient();
    const res = await app.inject({
      method: 'GET',
      url: `/api/clients/${cid}/packages/missing`,
      cookies: { sid },
    });
    expect(res.statusCode).toBe(404);
  });

  it('create с невалидными данными → 400', async () => {
    const cid = await createClient();
    const res = await app.inject({
      method: 'POST',
      url: `/api/clients/${cid}/packages`,
      cookies: { sid },
      payload: { lessonsPaid: 0, pricePerLesson: 1, totalPaid: 1, startsAt: '2026-06-01' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('без auth → 401', async () => {
    const cid = await createClient();
    const res = await app.inject({
      method: 'GET',
      url: `/api/clients/${cid}/packages`,
    });
    expect(res.statusCode).toBe(401);
  });
});
