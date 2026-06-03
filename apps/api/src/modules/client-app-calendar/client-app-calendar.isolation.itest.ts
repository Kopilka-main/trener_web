import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { buildApp } from '../../app.js';
import { createDb } from '../../db/client.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('client-app-calendar (isolation)', () => {
  const { db, sql: pg } = createDb(url!);
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    await db.execute(sql`DELETE FROM sessions`);
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

  it('без client_sid → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/client/sessions' });
    expect(res.statusCode).toBe(401);
  });

  it('непривязанный клиент → 409 NOT_LINKED', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/client/auth/register',
      payload: { email: 'cal-unl@b.co', password: 'longenough1', firstName: 'К', lastName: 'Л' },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/client/sessions',
      cookies: { client_sid: clientSid(reg) },
    });
    expect(res.statusCode).toBe(409);
  });

  it('клиент видит только свои занятия и подтверждает их', async () => {
    // Клиент A
    const regA = await app.inject({
      method: 'POST',
      url: '/api/client/auth/register',
      payload: { email: 'cal-a@b.co', password: 'longenough1', firstName: 'А', lastName: 'А' },
    });
    const accA = regA.json<{ account: { id: string } }>().account.id;
    const sidA = clientSid(regA);

    // Тренер
    const regT = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'cal-t@b.co', password: 'longenough1', firstName: 'Т', lastName: 'Р' },
    });
    const tSid = trainerSid(regT);

    // Два клиента у тренера: clientA привязан к аккаунту A, clientB — чужой.
    const cliA = await app.inject({
      method: 'POST',
      url: '/api/clients',
      cookies: { sid: tSid },
      payload: { firstName: 'Кли', lastName: 'А', accountId: accA },
    });
    const clientAId = cliA.json<{ client: { id: string } }>().client.id;
    const cliB = await app.inject({
      method: 'POST',
      url: '/api/clients',
      cookies: { sid: tSid },
      payload: { firstName: 'Кли', lastName: 'Б' },
    });
    const clientBId = cliB.json<{ client: { id: string } }>().client.id;

    // Занятие клиенту A (онлайн — должно быть видно клиенту) и клиенту B.
    const sesA = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      cookies: { sid: tSid },
      payload: { clientId: clientAId, date: '2026-06-10', startTime: '10:00', isOnline: true },
    });
    const sessionAId = sesA.json<{ session: { id: string } }>().session.id;
    await app.inject({
      method: 'POST',
      url: '/api/sessions',
      cookies: { sid: tSid },
      payload: { clientId: clientBId, date: '2026-06-11', startTime: '11:00' },
    });

    // Клиент A видит только своё занятие (онлайн включительно), статус pending.
    const list = await app.inject({
      method: 'GET',
      url: '/api/client/sessions?from=2026-06-01&to=2026-06-30',
      cookies: { client_sid: sidA },
    });
    expect(list.statusCode).toBe(200);
    const sessions = list.json<{ sessions: { id: string; clientConfirmation: string }[] }>()
      .sessions;
    expect(sessions.map((s) => s.id)).toEqual([sessionAId]);
    expect(sessions[0]?.clientConfirmation).toBe('pending');

    // Подтверждение своего занятия.
    const conf = await app.inject({
      method: 'POST',
      url: `/api/client/sessions/${sessionAId}/confirmation`,
      cookies: { client_sid: sidA },
      payload: { status: 'confirmed' },
    });
    expect(conf.statusCode).toBe(200);
    expect(
      conf.json<{ session: { clientConfirmation: string } }>().session.clientConfirmation,
    ).toBe('confirmed');

    // Чужое занятие подтвердить нельзя → 404.
    const sesBId = (
      await app.inject({
        method: 'GET',
        url: '/api/sessions?from=2026-06-01&to=2026-06-30',
        cookies: { sid: tSid },
      })
    )
      .json<{ sessions: { id: string; clientId: string }[] }>()
      .sessions.find((s) => s.clientId === clientBId)?.id;
    const forbidden = await app.inject({
      method: 'POST',
      url: `/api/client/sessions/${sesBId}/confirmation`,
      cookies: { client_sid: sidA },
      payload: { status: 'declined' },
    });
    expect(forbidden.statusCode).toBe(404);
  });
});
