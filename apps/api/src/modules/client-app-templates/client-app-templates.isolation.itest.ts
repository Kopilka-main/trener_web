import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { buildApp } from '../../app.js';
import { createDb } from '../../db/client.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('client-app-templates (isolation)', () => {
  const { db, sql: pg } = createDb(url!);
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    await db.execute(sql`DELETE FROM client_workout_templates`);
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

  function clientSid(res: Awaited<ReturnType<typeof app.inject>>): string {
    const c = res.cookies.find((ck) => ck.name === 'client_sid');
    if (!c) throw new Error('нет client_sid');
    return c.value;
  }
  function trainerSid(res: Awaited<ReturnType<typeof app.inject>>): string {
    const c = res.cookies.find((ck) => ck.name === 'sid');
    if (!c) throw new Error('нет sid');
    return c.value;
  }

  async function linkedClient(email: string) {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/client/auth/register',
      payload: { email, password: 'longenough1', firstName: 'К', lastName: 'Л' },
    });
    const accId = reg.json<{ account: { id: string } }>().account.id;
    const cSid = clientSid(reg);
    const regT = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: `t-${email}`, password: 'longenough1', firstName: 'Т', lastName: 'Р' },
    });
    const tSid = trainerSid(regT);
    await app.inject({
      method: 'POST',
      url: '/api/clients',
      cookies: { sid: tSid },
      payload: { firstName: 'Кли', lastName: 'Ент', accountId: accId },
    });
    return cSid;
  }

  const body = {
    name: 'Push',
    exercises: [{ exerciseId: 'ex1', sets: [{ plannedReps: 10, plannedWeightKg: 60 }] }],
  };

  it('без client_sid → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/client/templates' });
    expect(res.statusCode).toBe(401);
  });

  it('непривязанный клиент → 409', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/client/auth/register',
      payload: { email: 'tpl-unl@b.co', password: 'longenough1', firstName: 'К', lastName: 'Л' },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/client/templates',
      cookies: { client_sid: clientSid(reg) },
    });
    expect(res.statusCode).toBe(409);
  });

  it('create → list → delete', async () => {
    const cSid = await linkedClient('tpl-a@b.co');

    const created = await app.inject({
      method: 'POST',
      url: '/api/client/templates',
      cookies: { client_sid: cSid },
      payload: body,
    });
    expect(created.statusCode).toBe(201);
    const tpl = created.json<{ template: { id: string; name: string; exercises: unknown[] } }>()
      .template;
    expect(tpl.name).toBe('Push');
    expect(tpl.exercises).toHaveLength(1);

    const list = await app.inject({
      method: 'GET',
      url: '/api/client/templates',
      cookies: { client_sid: cSid },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json<{ templates: unknown[] }>().templates).toHaveLength(1);

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/client/templates/${tpl.id}`,
      cookies: { client_sid: cSid },
    });
    expect(del.statusCode).toBe(200);

    const after = await app.inject({
      method: 'GET',
      url: '/api/client/templates',
      cookies: { client_sid: cSid },
    });
    expect(after.json<{ templates: unknown[] }>().templates).toHaveLength(0);
  });

  it('изоляция: клиент B не видит шаблон клиента A', async () => {
    const aSid = await linkedClient('tpl-iso-a@b.co');
    const bSid = await linkedClient('tpl-iso-b@b.co');

    await app.inject({
      method: 'POST',
      url: '/api/client/templates',
      cookies: { client_sid: aSid },
      payload: body,
    });

    const bList = await app.inject({
      method: 'GET',
      url: '/api/client/templates',
      cookies: { client_sid: bSid },
    });
    expect(bList.json<{ templates: unknown[] }>().templates).toHaveLength(0);
  });
});
