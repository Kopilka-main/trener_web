import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { exercises } from '../../db/schema.js';
import { buildApp } from '../../app.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('templates isolation (integration)', () => {
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
    await db.execute(sql`DELETE FROM workout_templates`);
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

  it('B не видит/не правит/не удаляет шаблон A → 404; в списке B пусто', async () => {
    const sidA = await registerTrainer('a@b.co');
    const sidB = await registerTrainer('b@b.co');

    const created = await app.inject({
      method: 'POST',
      url: '/api/workout-templates',
      cookies: { sid: sidA },
      payload: { name: 'День ног', exercises: [{ exerciseId: 'g1', sets: 3, restSec: 90 }] },
    });
    const id = created.json<{ template: { id: string } }>().template.id;

    // B видит пустой список (шаблон A невидим).
    const listB = await app.inject({
      method: 'GET',
      url: '/api/workout-templates',
      cookies: { sid: sidB },
    });
    expect(listB.json<{ templates: unknown[] }>().templates).toHaveLength(0);

    // B → 404 на чтение/патч/удаление шаблона A.
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/workout-templates/${id}`,
          cookies: { sid: sidB },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/workout-templates/${id}`,
          cookies: { sid: sidB },
          payload: { name: 'hack' },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/api/workout-templates/${id}`,
          cookies: { sid: sidB },
        })
      ).statusCode,
    ).toBe(404);

    // A по-прежнему видит свой.
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/workout-templates/${id}`,
          cookies: { sid: sidA },
        })
      ).statusCode,
    ).toBe(200);
  });
});
