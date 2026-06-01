import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { buildApp } from '../../app.js';

const url = process.env.DATABASE_URL;

type ClientResp = { client: { id: string } };
type MeasurementResp = { measurement: { id: string } };

describe.skipIf(!url)('measurements isolation (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  let app: Awaited<ReturnType<typeof buildApp>>;

  async function registerTrainer(email: string): Promise<string> {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email, password: 'longenough1', firstName: 'T', lastName: 'R' },
    });
    return reg.cookies.find((c) => c.name === 'sid')!.value;
  }

  async function createClient(sid: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/clients',
      cookies: { sid },
      payload: { firstName: 'Кл', lastName: 'И' },
    });
    return res.json<ClientResp>().client.id;
  }

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM measurements`);
    await db.execute(sql`DELETE FROM trainer_clients`);
    await db.execute(sql`DELETE FROM clients`);
    await db.execute(sql`DELETE FROM sessions_auth`);
    await db.execute(sql`DELETE FROM trainers`);
    app = await buildApp({ db, cookieSecret: 'x'.repeat(40), isProd: false });
  });
  afterAll(async () => {
    await pg.end();
  });

  it('тренер B → 404 на замер клиента A; без auth → 401', async () => {
    const sidA = await registerTrainer('a@b.co');
    const sidB = await registerTrainer('b@b.co');
    const clientA = await createClient(sidA);
    const clientB = await createClient(sidB);

    const created = await app.inject({
      method: 'POST',
      url: `/api/clients/${clientA}/measurements`,
      cookies: { sid: sidA },
      payload: { date: '2026-06-01', weightKg: 80 },
    });
    const mid = created.json<MeasurementResp>().measurement.id;

    // B читает замер клиента A под клиентом A → 404 (requireClientAccess: чужой клиент)
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/clients/${clientA}/measurements/${mid}`,
          cookies: { sid: sidB },
        })
      ).statusCode,
    ).toBe(404);

    // B подставляет своего клиента, но чужой mid → 404 (scope в repo не находит)
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/clients/${clientB}/measurements/${mid}`,
          cookies: { sid: sidB },
        })
      ).statusCode,
    ).toBe(404);

    // B не может мутировать/удалить замер клиента A → 404
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/clients/${clientA}/measurements/${mid}`,
          cookies: { sid: sidB },
          payload: { weightKg: 1 },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/api/clients/${clientA}/measurements/${mid}`,
          cookies: { sid: sidB },
        })
      ).statusCode,
    ).toBe(404);

    // B не видит замеров клиента A в своём scope
    const listB = await app.inject({
      method: 'GET',
      url: `/api/clients/${clientB}/measurements`,
      cookies: { sid: sidB },
    });
    expect(listB.json<{ measurements: unknown[] }>().measurements).toHaveLength(0);

    // без auth → 401
    expect(
      (await app.inject({ method: 'GET', url: `/api/clients/${clientA}/measurements/${mid}` }))
        .statusCode,
    ).toBe(401);

    // A по-прежнему видит свой замер
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/clients/${clientA}/measurements/${mid}`,
          cookies: { sid: sidA },
        })
      ).statusCode,
    ).toBe(200);
  });
});
