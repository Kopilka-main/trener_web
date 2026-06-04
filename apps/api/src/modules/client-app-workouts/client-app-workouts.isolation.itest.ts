import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { buildApp } from '../../app.js';
import { createDb } from '../../db/client.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('client-app-workouts (isolation)', () => {
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

  it('весь сценарий: завершённую видно, незавершённую/чужую — нет, без привязки — 409', async () => {
    const regA = await app.inject({
      method: 'POST',
      url: '/api/client/auth/register',
      payload: { email: 'wa@b.co', password: 'longenough1', firstName: 'A', lastName: 'K' },
    });
    expect(regA.statusCode).toBe(201);
    const accAId = regA.json<{ account: { id: string } }>().account.id;
    const cookieA = clientCookie(regA);

    const before = await app.inject({
      method: 'GET',
      url: '/api/client/workouts',
      headers: { cookie: cookieA },
    });
    expect(before.statusCode).toBe(409);
    expect(before.json<{ code: string }>().code).toBe('NOT_LINKED');

    const regT = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'tr@b.co', password: 'longenough1', firstName: 'T', lastName: 'R' },
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

    const ex = await app.inject({
      method: 'POST',
      url: '/api/exercises',
      headers: { cookie: cookieT },
      payload: { name: 'Жим', category: 'Грудь' },
    });
    const exerciseId = ex.json<{ exercise: { id: string } }>().exercise.id;

    const wk = await app.inject({
      method: 'POST',
      url: `/api/clients/${clientId}/workouts`,
      headers: { cookie: cookieT },
      payload: {
        name: 'Тренировка 1',
        exercises: [{ exerciseId, sets: [{ plannedReps: 10, plannedWeightKg: 50 }] }],
      },
    });
    expect(wk.statusCode).toBe(201);
    const doneWid = wk.json<{ workout: { id: string } }>().workout.id;
    await app.inject({
      method: 'POST',
      url: `/api/clients/${clientId}/workouts/${doneWid}/start`,
      headers: { cookie: cookieT },
    });
    await app.inject({
      method: 'POST',
      url: `/api/clients/${clientId}/workouts/${doneWid}/complete`,
      headers: { cookie: cookieT },
      payload: {},
    });

    const draft = await app.inject({
      method: 'POST',
      url: `/api/clients/${clientId}/workouts`,
      headers: { cookie: cookieT },
      payload: { name: 'Черновик', exercises: [{ exerciseId, sets: [{ plannedReps: 8 }] }] },
    });
    const draftWid = draft.json<{ workout: { id: string } }>().workout.id;

    const list = await app.inject({
      method: 'GET',
      url: '/api/client/workouts',
      headers: { cookie: cookieA },
    });
    expect(list.statusCode).toBe(200);
    const workouts = list.json<{ workouts: { id: string; status: string }[] }>().workouts;
    expect(workouts.map((w) => w.id)).toEqual([doneWid]);
    expect(workouts.every((w) => w.status === 'completed')).toBe(true);

    const okDetail = await app.inject({
      method: 'GET',
      url: `/api/client/workouts/${doneWid}`,
      headers: { cookie: cookieA },
    });
    expect(okDetail.statusCode).toBe(200);
    const draftDetail = await app.inject({
      method: 'GET',
      url: `/api/client/workouts/${draftWid}`,
      headers: { cookie: cookieA },
    });
    expect(draftDetail.statusCode).toBe(404);

    const regB = await app.inject({
      method: 'POST',
      url: '/api/client/auth/register',
      payload: { email: 'wb@b.co', password: 'longenough1', firstName: 'B', lastName: 'K' },
    });
    const accBId = regB.json<{ account: { id: string } }>().account.id;
    const cookieB = clientCookie(regB);
    const cliB = await app.inject({
      method: 'POST',
      url: '/api/clients',
      headers: { cookie: cookieT },
      payload: { firstName: 'Би', lastName: 'Би', accountId: accBId },
    });
    expect(cliB.statusCode).toBe(201);
    const listB = await app.inject({
      method: 'GET',
      url: '/api/client/workouts',
      headers: { cookie: cookieB },
    });
    expect(listB.json<{ workouts: unknown[] }>().workouts).toEqual([]);
    const crossDetail = await app.inject({
      method: 'GET',
      url: `/api/client/workouts/${doneWid}`,
      headers: { cookie: cookieB },
    });
    expect(crossDetail.statusCode).toBe(404);
  });

  it('пустая своя тренировка: add/remove упражнения; тренерскую править нельзя', async () => {
    // Тренер + клиентский аккаунт + связь + видимое упражнение.
    const regT = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'tr2@b.co', password: 'longenough1', firstName: 'T', lastName: 'R' },
    });
    const cookieT = trainerCookie(regT);
    const regC = await app.inject({
      method: 'POST',
      url: '/api/client/auth/register',
      payload: { email: 'wc@b.co', password: 'longenough1', firstName: 'C', lastName: 'K' },
    });
    const accCId = regC.json<{ account: { id: string } }>().account.id;
    const cookieC = clientCookie(regC);
    const cli = await app.inject({
      method: 'POST',
      url: '/api/clients',
      headers: { cookie: cookieT },
      payload: { firstName: 'Це', lastName: 'Ка', accountId: accCId },
    });
    const clientId = cli.json<{ client: { id: string } }>().client.id;
    const ex = await app.inject({
      method: 'POST',
      url: '/api/exercises',
      headers: { cookie: cookieT },
      payload: { name: 'Присед', category: 'Ноги' },
    });
    const exerciseId = ex.json<{ exercise: { id: string } }>().exercise.id;

    // Клиент создаёт ПУСТУЮ тренировку.
    const create = await app.inject({
      method: 'POST',
      url: '/api/client/workouts',
      headers: { cookie: cookieC },
      payload: { name: 'Своя пустая', exercises: [] },
    });
    expect(create.statusCode).toBe(201);
    const wid = create.json<{ workout: { id: string; exercises: unknown[] } }>().workout.id;
    expect(create.json<{ workout: { exercises: unknown[] } }>().workout.exercises).toHaveLength(0);

    // Добавляет упражнение.
    const add = await app.inject({
      method: 'POST',
      url: `/api/client/workouts/${wid}/exercises`,
      headers: { cookie: cookieC },
      payload: { exerciseId, sets: [{ plannedReps: 10, plannedWeightKg: 40 }] },
    });
    expect(add.statusCode).toBe(200);
    expect(add.json<{ workout: { exercises: unknown[] } }>().workout.exercises).toHaveLength(1);

    // Добавляет второе упражнение и переставляет местами (reorder).
    await app.inject({
      method: 'POST',
      url: `/api/client/workouts/${wid}/exercises`,
      headers: { cookie: cookieC },
      payload: { exerciseId, sets: [{ plannedReps: 12 }] },
    });
    const reorder = await app.inject({
      method: 'PATCH',
      url: `/api/client/workouts/${wid}/exercises`,
      headers: { cookie: cookieC },
      payload: { order: [1, 0] },
    });
    expect(reorder.statusCode).toBe(200);
    expect(reorder.json<{ workout: { exercises: unknown[] } }>().workout.exercises).toHaveLength(2);

    // Убирает упражнение по позиции 0 (после reorder), затем второе.
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/client/workouts/${wid}/exercises/0`,
      headers: { cookie: cookieC },
    });
    expect(del.statusCode).toBe(200);
    expect(del.json<{ workout: { exercises: unknown[] } }>().workout.exercises).toHaveLength(1);
    await app.inject({
      method: 'DELETE',
      url: `/api/client/workouts/${wid}/exercises/0`,
      headers: { cookie: cookieC },
    });

    // Тренерскую тренировку клиент править не может (ownedByClientOnly → 404).
    const wkT = await app.inject({
      method: 'POST',
      url: `/api/clients/${clientId}/workouts`,
      headers: { cookie: cookieT },
      payload: { name: 'Тренерская', exercises: [{ exerciseId, sets: [{ plannedReps: 8 }] }] },
    });
    const widT = wkT.json<{ workout: { id: string } }>().workout.id;
    const addToTrainer = await app.inject({
      method: 'POST',
      url: `/api/client/workouts/${widT}/exercises`,
      headers: { cookie: cookieC },
      payload: { exerciseId, sets: [{ plannedReps: 5 }] },
    });
    expect(addToTrainer.statusCode).toBe(404);
    const delFromTrainer = await app.inject({
      method: 'DELETE',
      url: `/api/client/workouts/${widT}/exercises/0`,
      headers: { cookie: cookieC },
    });
    expect(delFromTrainer.statusCode).toBe(404);
    const reorderTrainer = await app.inject({
      method: 'PATCH',
      url: `/api/client/workouts/${widT}/exercises`,
      headers: { cookie: cookieC },
      payload: { order: [0] },
    });
    expect(reorderTrainer.statusCode).toBe(404);
  });

  it('без сессии → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/client/workouts' });
    expect(res.statusCode).toBe(401);
  });
});
