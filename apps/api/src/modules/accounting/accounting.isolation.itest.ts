import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { buildApp } from '../../app.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('accounting isolation (integration)', () => {
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
    await db.execute(sql`DELETE FROM expenses`);
    await db.execute(sql`DELETE FROM incomes`);
    await db.execute(sql`DELETE FROM gyms`);
    await db.execute(sql`DELETE FROM trainer_clients`);
    await db.execute(sql`DELETE FROM clients`);
    await db.execute(sql`DELETE FROM sessions_auth`);
    await db.execute(sql`DELETE FROM trainers`);
    app = await buildApp({ db, cookieSecret: 'x'.repeat(40), isProd: false });
  });
  afterAll(async () => {
    await pg.end();
  });

  it('тренер B не видит/не правит gyms, expenses, incomes тренера A', async () => {
    const sidA = await registerTrainer('a@b.co');
    const sidB = await registerTrainer('b@b.co');

    const gym = await app.inject({
      method: 'POST',
      url: '/api/gyms',
      cookies: { sid: sidA },
      payload: { name: 'Зал A' },
    });
    const gid = gym.json<{ gym: { id: string } }>().gym.id;

    const exp = await app.inject({
      method: 'POST',
      url: '/api/expenses',
      cookies: { sid: sidA },
      payload: { category: 'X', amount: 100, date: '2026-06-10' },
    });
    const eid = exp.json<{ expense: { id: string } }>().expense.id;

    const inc = await app.inject({
      method: 'POST',
      url: '/api/incomes',
      cookies: { sid: sidA },
      payload: { category: 'Y', amount: 500, date: '2026-06-10' },
    });
    const iid = inc.json<{ income: { id: string } }>().income.id;

    // Списки B пусты.
    expect(
      (await app.inject({ method: 'GET', url: '/api/gyms', cookies: { sid: sidB } })).json<{
        gyms: unknown[];
      }>().gyms,
    ).toHaveLength(0);
    expect(
      (await app.inject({ method: 'GET', url: '/api/expenses', cookies: { sid: sidB } })).json<{
        expenses: unknown[];
      }>().expenses,
    ).toHaveLength(0);
    expect(
      (await app.inject({ method: 'GET', url: '/api/incomes', cookies: { sid: sidB } })).json<{
        incomes: unknown[];
      }>().incomes,
    ).toHaveLength(0);

    // B → 404 на чтение/патч/удаление чужих записей.
    for (const [resource, rid] of [
      ['gyms', gid],
      ['expenses', eid],
      ['incomes', iid],
    ] as const) {
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `/api/${resource}/${rid}`,
            cookies: { sid: sidB },
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await app.inject({
            method: 'DELETE',
            url: `/api/${resource}/${rid}`,
            cookies: { sid: sidB },
          })
        ).statusCode,
      ).toBe(404);
    }

    // A по-прежнему видит свои записи.
    expect(
      (await app.inject({ method: 'GET', url: `/api/gyms/${gid}`, cookies: { sid: sidA } }))
        .statusCode,
    ).toBe(200);
  });

  it('GET /api/expenses без cookie → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/expenses' });
    expect(res.statusCode).toBe(401);
  });

  it('summary показывает только свои суммы', async () => {
    const sidA = await registerTrainer('a@b.co');
    const sidB = await registerTrainer('b@b.co');

    await app.inject({
      method: 'POST',
      url: '/api/incomes',
      cookies: { sid: sidA },
      payload: { category: 'X', amount: 1000, date: '2026-06-10' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/expenses',
      cookies: { sid: sidB },
      payload: { category: 'Y', amount: 999, date: '2026-06-10' },
    });

    const sB = (
      await app.inject({
        method: 'GET',
        url: '/api/accounting/summary?from=2026-06-01&to=2026-06-30',
        cookies: { sid: sidB },
      })
    ).json<{ totalIncome: number; totalExpense: number; balance: number }>();
    expect(sB.totalIncome).toBe(0); // доход A не виден B
    expect(sB.totalExpense).toBe(999);
    expect(sB.balance).toBe(-999);
  });

  it('нельзя завести expense на чужой gym (B на gym A) → 400', async () => {
    const sidA = await registerTrainer('a@b.co');
    const sidB = await registerTrainer('b@b.co');
    const gymA = await app.inject({
      method: 'POST',
      url: '/api/gyms',
      cookies: { sid: sidA },
      payload: { name: 'Зал A' },
    });
    const gid = gymA.json<{ gym: { id: string } }>().gym.id;

    const res = await app.inject({
      method: 'POST',
      url: '/api/expenses',
      cookies: { sid: sidB },
      payload: { category: 'X', amount: 10, date: '2026-06-10', gymId: gid },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ code: string }>().code).toBe('GYM_NOT_FOUND');
  });

  it('нельзя завести expense на несвязанного клиента (B на клиента A) → 400', async () => {
    const sidA = await registerTrainer('a@b.co');
    const sidB = await registerTrainer('b@b.co');
    const cidA = await createClient(sidA);

    const res = await app.inject({
      method: 'POST',
      url: '/api/expenses',
      cookies: { sid: sidB },
      payload: { category: 'X', amount: 10, date: '2026-06-10', clientId: cidA },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ code: string }>().code).toBe('CLIENT_NOT_LINKED');
  });
});
