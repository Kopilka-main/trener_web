import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { buildApp } from '../../app.js';
import { createDb } from '../../db/client.js';

const url = process.env.DATABASE_URL;

// Самостоятельные тренировки клиента: полный цикл (create→start→лог подхода→complete),
// видимость своих, изоляция от тренера, owned-only мутации, 401 без сессии.
describe.skipIf(!url)('client-app own-workouts (isolation)', () => {
  const { db, sql: pg } = createDb(url!);
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    await db.execute(sql`DELETE FROM client_sessions_auth`);
    await db.execute(sql`DELETE FROM client_accounts`);
    await db.execute(sql`DELETE FROM sessions_auth`);
    await db.execute(sql`DELETE FROM trainer_clients`);
    await db.execute(sql`DELETE FROM clients`);
    await db.execute(sql`DELETE FROM trainers`);
    app = await buildApp({ db, cookieSecret: 'x'.repeat(40), isProd: false });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await pg.end();
  });

  function clientCookie(res: Awaited<ReturnType<typeof app.inject>>): string {
    const c = res.cookies.find((ck) => ck.name === 'client_sid');
    if (!c) throw new Error('нет client_sid');
    return `client_sid=${c.value}`;
  }
  function trainerCookie(res: Awaited<ReturnType<typeof app.inject>>): string {
    const c = res.cookies.find((ck) => ck.name === 'sid');
    if (!c) throw new Error('нет sid');
    return `sid=${c.value}`;
  }

  it('клиент создаёт свою → стартует → логирует подход → завершает; тренер её не видит', async () => {
    // Клиент A + тренер T, связанные.
    const regA = await app.inject({
      method: 'POST',
      url: '/api/client/auth/register',
      payload: { email: 'owa@b.co', password: 'longenough1', firstName: 'A', lastName: 'K' },
    });
    expect(regA.statusCode).toBe(201);
    const accAId = regA.json<{ account: { id: string } }>().account.id;
    const cookieA = clientCookie(regA);

    const regT = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'owt@b.co', password: 'longenough1', firstName: 'T', lastName: 'R' },
    });
    expect(regT.statusCode).toBe(201);
    const cookieT = trainerCookie(regT);
    const cli = await app.inject({
      method: 'POST',
      url: '/api/clients',
      headers: { cookie: cookieT },
      payload: { firstName: 'Кли', lastName: 'Ент', accountId: accAId },
    });
    expect(cli.statusCode).toBe(201);
    const clientId = cli.json<{ client: { id: string } }>().client.id;

    // Упражнение создаёт тренер (видимо в его scope).
    const ex = await app.inject({
      method: 'POST',
      url: '/api/exercises',
      headers: { cookie: cookieT },
      payload: { name: 'Присед', category: 'Ноги' },
    });
    const exerciseId = ex.json<{ exercise: { id: string } }>().exercise.id;

    // Клиент создаёт свою тренировку.
    const created = await app.inject({
      method: 'POST',
      url: '/api/client/workouts',
      headers: { cookie: cookieA },
      payload: {
        name: 'Моя тренировка',
        exercises: [{ exerciseId, sets: [{ plannedReps: 10, plannedWeightKg: 40 }] }],
      },
    });
    expect(created.statusCode).toBe(201);
    const mine = created.json<{
      workout: { id: string; status: string; createdByClient: boolean };
    }>().workout;
    expect(mine.status).toBe('draft');
    expect(mine.createdByClient).toBe(true);
    const wid = mine.id;

    // Старт draft → active.
    const started = await app.inject({
      method: 'POST',
      url: `/api/client/workouts/${wid}/start`,
      headers: { cookie: cookieA },
    });
    expect(started.statusCode).toBe(200);
    expect(started.json<{ workout: { status: string } }>().workout.status).toBe('active');

    // Лог подхода (позиция 0, индекс 0) → done.
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/client/workouts/${wid}/sets/0:0`,
      headers: { cookie: cookieA },
      payload: { actualReps: 12, actualWeightKg: 42, done: true },
    });
    expect(patched.statusCode).toBe(200);
    const setRow = patched.json<{
      workout: { exercises: { sets: { done: boolean; actualReps: number | null }[] }[] };
    }>().workout.exercises[0]?.sets[0];
    expect(setRow?.done).toBe(true);
    expect(setRow?.actualReps).toBe(12);

    // Завершение active → completed.
    const completed = await app.inject({
      method: 'POST',
      url: `/api/client/workouts/${wid}/complete`,
      headers: { cookie: cookieA },
      payload: { rpe: 8 },
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.json<{ workout: { status: string } }>().workout.status).toBe('completed');

    // Клиентский список содержит свою.
    const list = await app.inject({
      method: 'GET',
      url: '/api/client/workouts',
      headers: { cookie: cookieA },
    });
    expect(list.statusCode).toBe(200);
    const ids = list.json<{ workouts: { id: string }[] }>().workouts.map((w) => w.id);
    expect(ids).toContain(wid);

    // Тренерский список клиента её НЕ содержит (самостоятельная).
    const trainerList = await app.inject({
      method: 'GET',
      url: `/api/clients/${clientId}/workouts`,
      headers: { cookie: cookieT },
    });
    expect(trainerList.statusCode).toBe(200);
    const trainerIds = trainerList.json<{ workouts: { id: string }[] }>().workouts.map((w) => w.id);
    expect(trainerIds).not.toContain(wid);
  });

  it('клиент не может стартовать/удалить тренерскую тренировку → 404', async () => {
    const regC = await app.inject({
      method: 'POST',
      url: '/api/client/auth/register',
      payload: { email: 'owc@b.co', password: 'longenough1', firstName: 'C', lastName: 'K' },
    });
    const accCId = regC.json<{ account: { id: string } }>().account.id;
    const cookieC = clientCookie(regC);

    const regT2 = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'owt2@b.co', password: 'longenough1', firstName: 'T', lastName: 'W' },
    });
    const cookieT2 = trainerCookie(regT2);
    const cli2 = await app.inject({
      method: 'POST',
      url: '/api/clients',
      headers: { cookie: cookieT2 },
      payload: { firstName: 'Кли', lastName: 'Энт', accountId: accCId },
    });
    const clientId2 = cli2.json<{ client: { id: string } }>().client.id;

    const ex2 = await app.inject({
      method: 'POST',
      url: '/api/exercises',
      headers: { cookie: cookieT2 },
      payload: { name: 'Жим', category: 'Грудь' },
    });
    const exerciseId2 = ex2.json<{ exercise: { id: string } }>().exercise.id;

    // Тренерская тренировка (createdByClient=false).
    const trainerWk = await app.inject({
      method: 'POST',
      url: `/api/clients/${clientId2}/workouts`,
      headers: { cookie: cookieT2 },
      payload: {
        name: 'От тренера',
        exercises: [{ exerciseId: exerciseId2, sets: [{ plannedReps: 8 }] }],
      },
    });
    expect(trainerWk.statusCode).toBe(201);
    const trainerWid = trainerWk.json<{ workout: { id: string } }>().workout.id;

    // Клиент не может стартовать тренерскую → 404.
    const startTrainer = await app.inject({
      method: 'POST',
      url: `/api/client/workouts/${trainerWid}/start`,
      headers: { cookie: cookieC },
    });
    expect(startTrainer.statusCode).toBe(404);

    // Клиент не может удалить тренерскую → 404.
    const delTrainer = await app.inject({
      method: 'DELETE',
      url: `/api/client/workouts/${trainerWid}`,
      headers: { cookie: cookieC },
    });
    expect(delTrainer.statusCode).toBe(404);
  });

  it('без client_sid → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/client/workouts',
      payload: { name: 'X', exercises: [{ exerciseId: 'e', sets: [{ plannedReps: 1 }] }] },
    });
    expect(res.statusCode).toBe(401);
  });
});
