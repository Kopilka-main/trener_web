import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { buildApp } from '../../app.js';

const url = process.env.DATABASE_URL;

type GymResp = { gym: { id: string; name: string; monthlyRent: number | null } };
type ExpenseResp = { expense: { id: string; amount: number; gymId: string | null } };
type IncomeResp = { income: { id: string; amount: number } };
type ClientResp = { client: { id: string } };
type SummaryResp = {
  from: string;
  to: string;
  totalIncome: number;
  totalExpense: number;
  balance: number;
};

describe.skipIf(!url)('accounting routes (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  let app: Awaited<ReturnType<typeof buildApp>>;
  let sid: string;

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM expenses`);
    await db.execute(sql`DELETE FROM incomes`);
    await db.execute(sql`DELETE FROM gyms`);
    await db.execute(sql`DELETE FROM trainer_clients`);
    await db.execute(sql`DELETE FROM clients`);
    await db.execute(sql`DELETE FROM sessions_auth`);
    await db.execute(sql`DELETE FROM trainers`);
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

  it('gyms CRUD', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/gyms',
      cookies: { sid },
      payload: { name: 'Зал №1', monthlyRent: 30000 },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json<GymResp>().gym.id;

    const list = await app.inject({ method: 'GET', url: '/api/gyms', cookies: { sid } });
    expect(list.json<{ gyms: unknown[] }>().gyms).toHaveLength(1);

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/gyms/${id}`,
      cookies: { sid },
      payload: { name: 'Зал №2' },
    });
    expect(patched.json<GymResp>().gym.name).toBe('Зал №2');

    const del = await app.inject({ method: 'DELETE', url: `/api/gyms/${id}`, cookies: { sid } });
    expect(del.statusCode).toBe(200);
    const after = await app.inject({ method: 'GET', url: `/api/gyms/${id}`, cookies: { sid } });
    expect(after.statusCode).toBe(404);
  });

  it('expenses CRUD + фильтр + привязка к своему gym/клиенту', async () => {
    const cid = await createClient();
    const gym = await app.inject({
      method: 'POST',
      url: '/api/gyms',
      cookies: { sid },
      payload: { name: 'Зал' },
    });
    const gid = gym.json<GymResp>().gym.id;

    const created = await app.inject({
      method: 'POST',
      url: '/api/expenses',
      cookies: { sid },
      payload: { category: 'Аренда', amount: 30000, date: '2026-06-10', gymId: gid, clientId: cid },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json<ExpenseResp>().expense.gymId).toBe(gid);
    const id = created.json<ExpenseResp>().expense.id;

    const inRange = await app.inject({
      method: 'GET',
      url: '/api/expenses?from=2026-06-01&to=2026-06-30',
      cookies: { sid },
    });
    expect(inRange.json<{ expenses: unknown[] }>().expenses).toHaveLength(1);
    const outRange = await app.inject({
      method: 'GET',
      url: '/api/expenses?from=2026-07-01&to=2026-07-31',
      cookies: { sid },
    });
    expect(outRange.json<{ expenses: unknown[] }>().expenses).toHaveLength(0);

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/expenses/${id}`,
      cookies: { sid },
      payload: { amount: 25000 },
    });
    expect(patched.json<ExpenseResp>().expense.amount).toBe(25000);

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/expenses/${id}`,
      cookies: { sid },
    });
    expect(del.statusCode).toBe(200);
  });

  it('expense на чужой gym → 400 GYM_NOT_FOUND', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/expenses',
      cookies: { sid },
      payload: { category: 'X', amount: 10, date: '2026-06-10', gymId: 'nope' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ code: string }>().code).toBe('GYM_NOT_FOUND');
  });

  it('expense на несвязанного клиента → 400 CLIENT_NOT_LINKED', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/expenses',
      cookies: { sid },
      payload: { category: 'X', amount: 10, date: '2026-06-10', clientId: 'nope' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ code: string }>().code).toBe('CLIENT_NOT_LINKED');
  });

  it('incomes CRUD', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/incomes',
      cookies: { sid },
      payload: { category: 'Тренировки', amount: 5000, date: '2026-06-10' },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json<IncomeResp>().income.id;
    const list = await app.inject({ method: 'GET', url: '/api/incomes', cookies: { sid } });
    expect(list.json<{ incomes: unknown[] }>().incomes).toHaveLength(1);
    const del = await app.inject({ method: 'DELETE', url: `/api/incomes/${id}`, cookies: { sid } });
    expect(del.statusCode).toBe(200);
  });

  it('summary считает доход/расход/баланс за период', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/incomes',
      cookies: { sid },
      payload: { category: 'X', amount: 5000, date: '2026-06-10' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/expenses',
      cookies: { sid },
      payload: { category: 'Y', amount: 2000, date: '2026-06-15' },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/accounting/summary?from=2026-06-01&to=2026-06-30',
      cookies: { sid },
    });
    expect(res.statusCode).toBe(200);
    const s = res.json<SummaryResp>();
    expect(s).toEqual({
      from: '2026-06-01',
      to: '2026-06-30',
      totalIncome: 5000,
      totalExpense: 2000,
      balance: 3000,
    });
  });

  it('без auth → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/gyms' });
    expect(res.statusCode).toBe(401);
  });
});
