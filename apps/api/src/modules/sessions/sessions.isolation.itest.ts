import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { buildApp } from '../../app.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('sessions isolation (integration)', () => {
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
    return res.json<{ client: { id: string } }>().client.id;
  }

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM sessions`);
    await db.execute(sql`DELETE FROM trainer_clients`);
    await db.execute(sql`DELETE FROM clients`);
    await db.execute(sql`DELETE FROM sessions_auth`);
    await db.execute(sql`DELETE FROM trainers`);
    app = await buildApp({ db, cookieSecret: 'x'.repeat(40), isProd: false });
  });
  afterAll(async () => {
    await pg.end();
  });

  it('тренер B не видит/не правит/не удаляет занятие A (404)', async () => {
    const sidA = await registerTrainer('a@b.co');
    const sidB = await registerTrainer('b@b.co');
    const cidA = await createClient(sidA);

    const created = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      cookies: { sid: sidA },
      payload: { clientId: cidA, date: '2026-06-10', startTime: '10:00' },
    });
    const id = created.json<{ session: { id: string } }>().session.id;

    // B не видит занятие A в своём списке.
    const listB = await app.inject({ method: 'GET', url: '/api/sessions', cookies: { sid: sidB } });
    expect(listB.json<{ sessions: unknown[] }>().sessions).toHaveLength(0);

    // B получает 404 на чтение/патч/удаление чужого занятия.
    expect(
      (await app.inject({ method: 'GET', url: `/api/sessions/${id}`, cookies: { sid: sidB } }))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/sessions/${id}`,
          cookies: { sid: sidB },
          payload: { title: 'hack' },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/sessions/${id}`, cookies: { sid: sidB } }))
        .statusCode,
    ).toBe(404);

    // A по-прежнему видит своё занятие (B ничего не сломал).
    expect(
      (await app.inject({ method: 'GET', url: `/api/sessions/${id}`, cookies: { sid: sidA } }))
        .statusCode,
    ).toBe(200);
  });

  it('нельзя создать занятие на клиента, не связанного с тобой → 400', async () => {
    const sidA = await registerTrainer('a@b.co');
    const sidB = await registerTrainer('b@b.co');
    // Клиент связан только с A.
    const cidA = await createClient(sidA);

    // B пытается создать занятие на чужого клиента → 400 CLIENT_NOT_LINKED.
    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      cookies: { sid: sidB },
      payload: { clientId: cidA, date: '2026-06-10', startTime: '10:00' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ code: string }>().code).toBe('CLIENT_NOT_LINKED');
  });
});
