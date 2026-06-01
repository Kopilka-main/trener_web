import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { buildApp } from '../../app.js';

const url = process.env.DATABASE_URL;

type ClientResp = { client: { id: string } };
type MeasurementResp = {
  measurement: {
    id: string;
    clientId: string;
    date: string;
    weightKg: number | null;
    bodyFatPct: number | null;
    chestCm: number | null;
    waistCm: number | null;
    hipsCm: number | null;
    note: string | null;
    createdAt: string;
  };
};

describe.skipIf(!url)('measurements routes (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  let app: Awaited<ReturnType<typeof buildApp>>;
  let sid: string;

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM measurements`);
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
      url: `/api/clients/${cid}/measurements`,
      cookies: { sid },
      payload: { date: '2026-06-01', weightKg: 80, waistCm: 85, note: 'утро' },
    });
    expect(created.statusCode).toBe(201);
    const m = created.json<MeasurementResp>().measurement;
    expect(m.clientId).toBe(cid);
    expect(m.weightKg).toBe(80);
    expect(m.waistCm).toBe(85);
    expect(m.bodyFatPct).toBeNull();
    expect(m.note).toBe('утро');
    const mid = m.id;

    const list = await app.inject({
      method: 'GET',
      url: `/api/clients/${cid}/measurements`,
      cookies: { sid },
    });
    expect(list.json<{ measurements: unknown[] }>().measurements).toHaveLength(1);

    const got = await app.inject({
      method: 'GET',
      url: `/api/clients/${cid}/measurements/${mid}`,
      cookies: { sid },
    });
    expect(got.statusCode).toBe(200);
    expect(got.json<MeasurementResp>().measurement.id).toBe(mid);

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/clients/${cid}/measurements/${mid}`,
      cookies: { sid },
      payload: { weightKg: 78, note: null },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json<MeasurementResp>().measurement.weightKg).toBe(78);
    expect(patched.json<MeasurementResp>().measurement.note).toBeNull();

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/clients/${cid}/measurements/${mid}`,
      cookies: { sid },
    });
    expect(del.statusCode).toBe(200);
    expect(del.json<{ ok: boolean }>().ok).toBe(true);

    const after = await app.inject({
      method: 'GET',
      url: `/api/clients/${cid}/measurements/${mid}`,
      cookies: { sid },
    });
    expect(after.statusCode).toBe(404);
  });

  it('get несуществующего замера → 404', async () => {
    const cid = await createClient();
    const res = await app.inject({
      method: 'GET',
      url: `/api/clients/${cid}/measurements/missing`,
      cookies: { sid },
    });
    expect(res.statusCode).toBe(404);
  });

  it('create с невалидными данными → 400', async () => {
    const cid = await createClient();
    const res = await app.inject({
      method: 'POST',
      url: `/api/clients/${cid}/measurements`,
      cookies: { sid },
      payload: { date: '01-06-2026', weightKg: -1 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('без auth → 401', async () => {
    const cid = await createClient();
    const res = await app.inject({
      method: 'GET',
      url: `/api/clients/${cid}/measurements`,
    });
    expect(res.statusCode).toBe(401);
  });
});
