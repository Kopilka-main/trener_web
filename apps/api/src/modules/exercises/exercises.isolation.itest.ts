import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { exercises } from '../../db/schema.js';
import { buildApp } from '../../app.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('exercises isolation (integration)', () => {
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
    await db.execute(sql`DELETE FROM client_workouts`);
    await db.execute(sql`DELETE FROM exercises`);
    await db.execute(sql`DELETE FROM sessions_auth`);
    await db.execute(sql`DELETE FROM trainers`);
    await db
      .insert(exercises)
      .values({ id: 'g1', trainerId: null, name: 'Жим лёжа', category: 'Грудь', restSec: 90 });
    app = await buildApp({ db, cookieSecret: 'x'.repeat(40), isProd: false });
  });
  afterAll(async () => {
    await pg.end();
  });

  it('B не видит личное A (но видит глобальное); B не правит/не удаляет личное A (404)', async () => {
    const sidA = await registerTrainer('a@b.co');
    const sidB = await registerTrainer('b@b.co');

    const created = await app.inject({
      method: 'POST',
      url: '/api/exercises',
      cookies: { sid: sidA },
      payload: { name: 'Присед', category: 'Ноги' },
    });
    const id = created.json<{ exercise: { id: string } }>().exercise.id;

    // B видит только глобальную (личное A не видит).
    const listB = await app.inject({
      method: 'GET',
      url: '/api/exercises',
      cookies: { sid: sidB },
    });
    const itemsB = listB.json<{ exercises: { id: string }[] }>().exercises;
    expect(itemsB).toHaveLength(1);
    expect(itemsB[0]?.id).toBe('g1');

    // B получает 404 на чтение/патч/удаление личного A.
    expect(
      (await app.inject({ method: 'GET', url: `/api/exercises/${id}`, cookies: { sid: sidB } }))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/exercises/${id}`,
          cookies: { sid: sidB },
          payload: { name: 'hack' },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/exercises/${id}`, cookies: { sid: sidB } }))
        .statusCode,
    ).toBe(404);

    // Глобальную видят оба.
    expect(
      (await app.inject({ method: 'GET', url: '/api/exercises/g1', cookies: { sid: sidA } }))
        .statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: '/api/exercises/g1', cookies: { sid: sidB } }))
        .statusCode,
    ).toBe(200);

    // A по-прежнему видит своё.
    expect(
      (await app.inject({ method: 'GET', url: `/api/exercises/${id}`, cookies: { sid: sidA } }))
        .statusCode,
    ).toBe(200);
  });
});
