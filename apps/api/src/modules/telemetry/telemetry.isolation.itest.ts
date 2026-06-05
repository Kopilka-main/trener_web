import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { buildApp } from '../../app.js';
import { createDb } from '../../db/client.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('telemetry (isolation)', () => {
  const { db, sql: pg } = createDb(url!);
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    await db.execute(sql`DELETE FROM analytics_events`);
    await db.execute(sql`DELETE FROM error_logs`);
    await db.execute(sql`DELETE FROM client_sessions_auth`);
    await db.execute(sql`DELETE FROM client_accounts`);
    // client_workout_exercises ссылается на exercises без CASCADE — чистим явно
    // до удаления trainers (иначе cascade exercises → FK violation).
    await db.execute(sql`DELETE FROM client_workout_exercises`);
    await db.execute(sql`DELETE FROM sessions_auth`);
    await db.execute(sql`DELETE FROM trainers`);
    app = await buildApp({ db, cookieSecret: 'x'.repeat(40), isProd: false });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await pg.end();
  });

  it('аноним: события пишутся с actor_type=anon', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/telemetry/events',
      payload: { source: 'client', sessionId: 's1', events: [{ name: 'page_view', path: '/' }] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ accepted: number }>().accepted).toBe(1);
    const rows = await db.execute(sql`SELECT actor_type FROM analytics_events`);
    expect(rows[0]?.actor_type).toBe('anon');
  });

  it('тренер: атрибуция по куке sid (actor_type=trainer)', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'tm@b.co', password: 'longenough1', firstName: 'Т', lastName: 'Р' },
    });
    const sid = reg.cookies.find((c) => c.name === 'sid')!.value;
    await app.inject({
      method: 'POST',
      url: '/api/telemetry/events',
      cookies: { sid },
      payload: { source: 'trainer', sessionId: 's2', events: [{ name: 'click' }] },
    });
    const rows = await db.execute(
      sql`SELECT actor_type FROM analytics_events WHERE session_id = 's2'`,
    );
    expect(rows[0]?.actor_type).toBe('trainer');
  });

  it('клиентские ошибки пишутся в error_logs', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/telemetry/errors',
      payload: { source: 'client', errors: [{ message: 'boom', stack: 'at x' }] },
    });
    expect(res.statusCode).toBe(200);
    const rows = await db.execute(
      sql`SELECT source, message FROM error_logs WHERE source = 'client'`,
    );
    expect(rows[0]?.message).toBe('boom');
  });
});
