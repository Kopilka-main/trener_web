import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { buildApp } from '../../app.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('clients isolation (integration)', () => {
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

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM trainer_clients`);
    await db.execute(sql`DELETE FROM clients`);
    await db.execute(sql`DELETE FROM sessions_auth`);
    await db.execute(sql`DELETE FROM trainers`);
    app = await buildApp({ db, cookieSecret: 'x'.repeat(40), isProd: false });
  });
  afterAll(async () => {
    await pg.end();
  });

  it('тренер B не видит/не меняет/не удаляет клиента тренера A (404)', async () => {
    const sidA = await registerTrainer('a@b.co');
    const sidB = await registerTrainer('b@b.co');

    const created = await app.inject({
      method: 'POST',
      url: '/api/clients',
      cookies: { sid: sidA },
      payload: { firstName: 'Алина', lastName: 'К' },
    });
    const id = created.json<{ client: { id: string } }>().client.id;

    // B не видит A-клиента в своём списке
    const listB = await app.inject({ method: 'GET', url: '/api/clients', cookies: { sid: sidB } });
    expect(listB.json<{ clients: unknown[] }>().clients).toHaveLength(0);

    // B получает 404 на чтение/патч/удаление чужого клиента
    expect(
      (await app.inject({ method: 'GET', url: `/api/clients/${id}`, cookies: { sid: sidB } }))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/clients/${id}`,
          cookies: { sid: sidB },
          payload: { notes: 'hack' },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/clients/${id}`, cookies: { sid: sidB } }))
        .statusCode,
    ).toBe(404);

    // A по-прежнему видит своего клиента (B ничего не сломал)
    expect(
      (await app.inject({ method: 'GET', url: `/api/clients/${id}`, cookies: { sid: sidA } }))
        .statusCode,
    ).toBe(200);
  });
});
