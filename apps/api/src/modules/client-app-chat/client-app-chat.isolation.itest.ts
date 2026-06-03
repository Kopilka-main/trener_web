import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { buildApp } from '../../app.js';
import { createDb } from '../../db/client.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('client-app-chat (isolation)', () => {
  const { db, sql: pg } = createDb(url!);
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    await db.execute(sql`DELETE FROM messages`);
    await db.execute(sql`DELETE FROM conversations`);
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

  it('переписка клиент↔тренер: лента, отправка, непрочитанные, прочтение', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/client/auth/register',
      payload: { email: 'chat@b.co', password: 'longenough1', firstName: 'К', lastName: 'Л' },
    });
    const accId = reg.json<{ account: { id: string } }>().account.id;
    const cSid = clientSid(reg);

    const before = await app.inject({
      method: 'GET',
      url: '/api/client/chat/messages',
      cookies: { client_sid: cSid },
    });
    expect(before.statusCode).toBe(409);

    const regT = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'tch@b.co', password: 'longenough1', firstName: 'Т', lastName: 'Р' },
    });
    const tSid = trainerSid(regT);
    const cli = await app.inject({
      method: 'POST',
      url: '/api/clients',
      cookies: { sid: tSid },
      payload: { firstName: 'Кли', lastName: 'Ент', accountId: accId },
    });
    const clientId = cli.json<{ client: { id: string } }>().client.id;

    await app.inject({
      method: 'POST',
      url: `/api/clients/${clientId}/messages`,
      cookies: { sid: tSid },
      payload: { body: 'Привет от тренера' },
    });

    const list = await app.inject({
      method: 'GET',
      url: '/api/client/chat/messages',
      cookies: { client_sid: cSid },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json<{ trainerLastReadAt: string | null }>().trainerLastReadAt).toBeNull();
    const msgs = list.json<{ messages: { senderRole: string; body: string }[] }>().messages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.senderRole).toBe('trainer');

    const unread1 = await app.inject({
      method: 'GET',
      url: '/api/client/chat/unread',
      cookies: { client_sid: cSid },
    });
    expect(unread1.json<{ count: number }>().count).toBe(1);

    const sent = await app.inject({
      method: 'POST',
      url: '/api/client/chat/messages',
      cookies: { client_sid: cSid },
      payload: { body: 'Привет, тренер' },
    });
    expect(sent.statusCode).toBe(200);
    expect(sent.json<{ message: { senderRole: string } }>().message.senderRole).toBe('client');

    const tList = await app.inject({
      method: 'GET',
      url: `/api/clients/${clientId}/messages`,
      cookies: { sid: tSid },
    });
    const tMsgs = tList.json<{ messages: { senderRole: string }[] }>().messages;
    expect(tMsgs).toHaveLength(2);
    expect(tMsgs[1]!.senderRole).toBe('client');

    await app.inject({
      method: 'POST',
      url: '/api/client/chat/read',
      cookies: { client_sid: cSid },
    });
    const unread2 = await app.inject({
      method: 'GET',
      url: '/api/client/chat/unread',
      cookies: { client_sid: cSid },
    });
    expect(unread2.json<{ count: number }>().count).toBe(0);

    await app.inject({
      method: 'POST',
      url: `/api/clients/${clientId}/messages/read`,
      cookies: { sid: tSid },
    });
    const list2 = await app.inject({
      method: 'GET',
      url: '/api/client/chat/messages',
      cookies: { client_sid: cSid },
    });
    expect(list2.json<{ trainerLastReadAt: string | null }>().trainerLastReadAt).not.toBeNull();
  });

  it('без сессии → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/client/chat/messages' });
    expect(res.statusCode).toBe(401);
  });
});
