import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { buildApp } from '../../app.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('calendar feed isolation (integration)', () => {
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

  async function createSession(sid: string, title: string): Promise<void> {
    await app.inject({
      method: 'POST',
      url: '/api/sessions',
      cookies: { sid },
      payload: { date: '2026-07-01', startTime: '09:00', durationMin: 60, title, isOnline: false },
    });
  }

  // Достать токен фида из ссылки .../api/calendar/<token>.ics.
  async function feedToken(sid: string): Promise<string> {
    const res = await app.inject({ method: 'GET', url: '/api/calendar/feed', cookies: { sid } });
    const { url: feedUrl } = res.json<{ url: string }>();
    return feedUrl.replace(/^.*\/api\/calendar\//, '').replace(/\.ics$/, '');
  }

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM sessions`);
    await db.execute(sql`DELETE FROM trainer_clients`);
    await db.execute(sql`DELETE FROM clients`);
    await db.execute(sql`DELETE FROM sessions_auth`);
    await db.execute(sql`DELETE FROM trainers`);
    app = await buildApp({ db, cookieSecret: 'x'.repeat(40), isProd: false });
  });
  afterAll(async () => {
    await pg.end();
  });

  it('фид тренера A содержит только занятия A, не B', async () => {
    const sidA = await registerTrainer('a@b.co');
    const sidB = await registerTrainer('b@b.co');
    await createSession(sidA, 'Занятие A');
    await createSession(sidB, 'Занятие B');

    const tokenA = await feedToken(sidA);
    const res = await app.inject({ method: 'GET', url: `/api/calendar/${tokenA}.ics` });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/calendar');
    expect(res.body).toContain('SUMMARY:Занятие A');
    expect(res.body).not.toContain('SUMMARY:Занятие B');
  });

  it('GET /api/calendar/feed без cookie → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/calendar/feed' });
    expect(res.statusCode).toBe(401);
  });

  it('неизвестный токен → 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/calendar/deadbeef.ics' });
    expect(res.statusCode).toBe(404);
  });

  it('повторный запрос ссылки возвращает тот же токен', async () => {
    const sid = await registerTrainer('a@b.co');
    const t1 = await feedToken(sid);
    const t2 = await feedToken(sid);
    expect(t1).toBe(t2);
  });
});
