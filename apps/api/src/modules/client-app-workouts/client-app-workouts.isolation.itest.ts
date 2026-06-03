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

  it('без сессии → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/client/workouts' });
    expect(res.statusCode).toBe(401);
  });
});
