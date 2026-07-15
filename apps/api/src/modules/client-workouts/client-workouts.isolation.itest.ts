import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { exercises } from '../../db/schema.js';
import { buildApp } from '../../app.js';

const url = process.env.DATABASE_URL;

type ClientResp = { client: { id: string } };
type WorkoutResp = { workout: { id: string } };

describe.skipIf(!url)('client-workouts isolation (integration)', () => {
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
    await db.execute(sql`DELETE FROM client_workouts`);
    await db.execute(sql`DELETE FROM trainer_clients`);
    await db.execute(sql`DELETE FROM clients`);
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

  it('тренер B (со своим клиентом) → 404 на тренировку клиента A; без auth → 401', async () => {
    const sidA = await registerTrainer('a@b.co');
    const sidB = await registerTrainer('b@b.co');
    const clientA = await createClient(sidA);
    const clientB = await createClient(sidB);

    const created = await app.inject({
      method: 'POST',
      url: `/api/clients/${clientA}/workouts`,
      cookies: { sid: sidA },
      payload: { name: 'A workout', exercises: [{ exerciseId: 'g1', sets: [{ plannedReps: 5 }] }] },
    });
    const wid = created.json<WorkoutResp>().workout.id;

    // B пытается читать тренировку клиента A под своим (валидным) клиентом → 404 (requireClientAccess: чужой клиент)
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/clients/${clientA}/workouts/${wid}`,
          cookies: { sid: sidB },
        })
      ).statusCode,
    ).toBe(404);

    // B подставляет своего клиента, но чужой workoutId → 404 (scope в repo не находит)
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/clients/${clientB}/workouts/${wid}`,
          cookies: { sid: sidB },
        })
      ).statusCode,
    ).toBe(404);

    // B не может мутировать (start/complete/delete) тренировку клиента A → 404
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/clients/${clientA}/workouts/${wid}/start`,
          cookies: { sid: sidB },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/api/clients/${clientA}/workouts/${wid}`,
          cookies: { sid: sidB },
        })
      ).statusCode,
    ).toBe(404);

    // B не видит тренировок клиента A в своём scope (под своим клиентом)
    const listB = await app.inject({
      method: 'GET',
      url: `/api/clients/${clientB}/workouts`,
      cookies: { sid: sidB },
    });
    expect(listB.json<{ workouts: unknown[] }>().workouts).toHaveLength(0);

    // без auth → 401
    expect(
      (await app.inject({ method: 'GET', url: `/api/clients/${clientA}/workouts/${wid}` }))
        .statusCode,
    ).toBe(401);

    // A по-прежнему видит свою тренировку
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/clients/${clientA}/workouts/${wid}`,
          cookies: { sid: sidA },
        })
      ).statusCode,
    ).toBe(200);
  });

  it('тренер B не может импортировать тренировку клиенту A → 404; без auth → 401', async () => {
    const sidA = await registerTrainer('a@b.co');
    const sidB = await registerTrainer('b@b.co');
    const clientA = await createClient(sidA);

    const body = {
      idempotencyKey: '44444444-4444-4444-8444-444444444444',
      name: 'Чужой импорт',
      status: 'completed',
      startedAt: '2026-07-13T09:00:00.000Z',
      completedAt: '2026-07-13T10:00:00.000Z',
      exercises: [{ exerciseId: 'g1', sets: [{ plannedReps: 10, actualReps: 8, done: true }] }],
    };

    // B пытается импортировать в тренировки клиента A (не своего) → 404 (requireClientAccess)
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/clients/${clientA}/workouts/import`,
          cookies: { sid: sidB },
          payload: body,
        })
      ).statusCode,
    ).toBe(404);

    // без auth → 401
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/clients/${clientA}/workouts/import`,
          payload: body,
        })
      ).statusCode,
    ).toBe(401);

    // A по-прежнему может импортировать себе (та же пара) — sanity check, что 404 выше
    // не из-за самого запроса, а именно из-за чужого клиента
    const okForA = await app.inject({
      method: 'POST',
      url: `/api/clients/${clientA}/workouts/import`,
      cookies: { sid: sidA },
      payload: body,
    });
    expect(okForA.statusCode).toBe(200);
  });
});
