import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { exercises } from '../../db/schema.js';
import { buildApp } from '../../app.js';

const url = process.env.DATABASE_URL;

type ClientResp = { client: { id: string } };
type WorkoutResp = {
  workout: {
    id: string;
    clientId: string;
    status: string;
    startedAt: string | null;
    completedAt: string | null;
    rpe: number | null;
    exercises: {
      position: number;
      exerciseName: string;
      sets: { setIndex: number; actualReps: number | null; done: boolean }[];
    }[];
  };
};

describe.skipIf(!url)('client-workouts routes (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  let app: Awaited<ReturnType<typeof buildApp>>;
  let sid: string;

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

  it('полный флоу: план → start → фиксация факта → complete', async () => {
    const cid = await createClient();

    const created = await app.inject({
      method: 'POST',
      url: `/api/clients/${cid}/workouts`,
      cookies: { sid },
      payload: {
        name: 'День груди',
        exercises: [{ exerciseId: 'g1', sets: [{ plannedReps: 10 }, { plannedReps: 8 }] }],
      },
    });
    expect(created.statusCode).toBe(201);
    const w = created.json<WorkoutResp>().workout;
    expect(w.status).toBe('draft');
    expect(w.clientId).toBe(cid);
    expect(w.exercises[0]?.exerciseName).toBe('Жим лёжа');
    expect(w.exercises[0]?.sets).toHaveLength(2);
    const wid = w.id;

    const list = await app.inject({
      method: 'GET',
      url: `/api/clients/${cid}/workouts`,
      cookies: { sid },
    });
    expect(list.json<{ workouts: unknown[] }>().workouts).toHaveLength(1);

    const started = await app.inject({
      method: 'POST',
      url: `/api/clients/${cid}/workouts/${wid}/start`,
      cookies: { sid },
    });
    expect(started.statusCode).toBe(200);
    expect(started.json<WorkoutResp>().workout.status).toBe('active');
    expect(started.json<WorkoutResp>().workout.startedAt).not.toBeNull();

    // фиксация факта по подходу 1 (index 1)
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/clients/${cid}/workouts/${wid}/exercises/0/sets/1`,
      cookies: { sid },
      payload: { actualReps: 7, done: true },
    });
    expect(patched.statusCode).toBe(200);
    const ps = patched.json<WorkoutResp>().workout.exercises[0]?.sets[1];
    expect(ps?.actualReps).toBe(7);
    expect(ps?.done).toBe(true);

    const completed = await app.inject({
      method: 'POST',
      url: `/api/clients/${cid}/workouts/${wid}/complete`,
      cookies: { sid },
      payload: { durationSec: 3600, rpe: 8 },
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.json<WorkoutResp>().workout.status).toBe('completed');

    // GET показывает факт и status completed
    const got = await app.inject({
      method: 'GET',
      url: `/api/clients/${cid}/workouts/${wid}`,
      cookies: { sid },
    });
    const gw = got.json<WorkoutResp>().workout;
    expect(gw.status).toBe('completed');
    expect(gw.completedAt).not.toBeNull();
    expect(gw.rpe).toBe(8);
    expect(gw.exercises[0]?.sets[1]?.actualReps).toBe(7);
    expect(gw.exercises[0]?.sets[1]?.done).toBe(true);
  });

  it('start из не-draft → 409 BAD_STATUS', async () => {
    const cid = await createClient();
    const created = await app.inject({
      method: 'POST',
      url: `/api/clients/${cid}/workouts`,
      cookies: { sid },
      payload: { name: 'X', exercises: [{ exerciseId: 'g1', sets: [{ plannedReps: 5 }] }] },
    });
    const wid = created.json<WorkoutResp>().workout.id;
    await app.inject({
      method: 'POST',
      url: `/api/clients/${cid}/workouts/${wid}/start`,
      cookies: { sid },
    });
    const again = await app.inject({
      method: 'POST',
      url: `/api/clients/${cid}/workouts/${wid}/start`,
      cookies: { sid },
    });
    expect(again.statusCode).toBe(409);
    expect(again.json<{ code: string }>().code).toBe('BAD_STATUS');
  });

  it('создание с невидимым упражнением → 400 UNKNOWN_EXERCISE', async () => {
    const cid = await createClient();
    const res = await app.inject({
      method: 'POST',
      url: `/api/clients/${cid}/workouts`,
      cookies: { sid },
      payload: { name: 'X', exercises: [{ exerciseId: 'nope', sets: [{}] }] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ code: string }>().code).toBe('UNKNOWN_EXERCISE');
  });

  it('delete тренировки → 200, затем 404', async () => {
    const cid = await createClient();
    const created = await app.inject({
      method: 'POST',
      url: `/api/clients/${cid}/workouts`,
      cookies: { sid },
      payload: { name: 'X', exercises: [{ exerciseId: 'g1', sets: [{}] }] },
    });
    const wid = created.json<WorkoutResp>().workout.id;
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/clients/${cid}/workouts/${wid}`,
      cookies: { sid },
    });
    expect(del.statusCode).toBe(200);
    const after = await app.inject({
      method: 'GET',
      url: `/api/clients/${cid}/workouts/${wid}`,
      cookies: { sid },
    });
    expect(after.statusCode).toBe(404);
  });

  it('без auth → 401', async () => {
    const cid = await createClient();
    const res = await app.inject({
      method: 'GET',
      url: `/api/clients/${cid}/workouts`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST import: создаёт тренировку, повтор ключа не дублирует, без auth → 401', async () => {
    const cid = await createClient();
    const key = '33333333-3333-4333-8333-333333333333';
    const body = {
      idempotencyKey: key,
      name: 'Импорт-роут',
      status: 'completed',
      startedAt: '2026-07-13T09:00:00.000Z',
      completedAt: '2026-07-13T10:00:00.000Z',
      exercises: [{ exerciseId: 'g1', sets: [{ plannedReps: 10, actualReps: 8, done: true }] }],
    };

    const r1 = await app.inject({
      method: 'POST',
      url: `/api/clients/${cid}/workouts/import`,
      cookies: { sid },
      payload: body,
    });
    expect(r1.statusCode).toBe(200);
    const w1 = r1.json<WorkoutResp>().workout;
    expect(w1.status).toBe('completed');

    const r2 = await app.inject({
      method: 'POST',
      url: `/api/clients/${cid}/workouts/import`,
      cookies: { sid },
      payload: body,
    });
    expect(r2.statusCode).toBe(200);
    expect(r2.json<WorkoutResp>().workout.id).toBe(w1.id);

    const list = await app.inject({
      method: 'GET',
      url: `/api/clients/${cid}/workouts`,
      cookies: { sid },
    });
    expect(
      list
        .json<{ workouts: { name: string }[] }>()
        .workouts.filter((w) => w.name === 'Импорт-роут'),
    ).toHaveLength(1);

    const noAuth = await app.inject({
      method: 'POST',
      url: `/api/clients/${cid}/workouts/import`,
      payload: body,
    });
    expect(noAuth.statusCode).toBe(401);
  });
});
