import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { buildApp } from '../../app.js';

const url = process.env.DATABASE_URL;

type ClientResp = { client: { id: string } };
type MessageResp = { message: { id: string } };

describe.skipIf(!url)('chat isolation (integration)', () => {
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
    return res.json<ClientResp>().client.id;
  }

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM messages`);
    await db.execute(sql`DELETE FROM conversations`);
    await db.execute(sql`DELETE FROM trainer_clients`);
    await db.execute(sql`DELETE FROM clients`);
    await db.execute(sql`DELETE FROM sessions_auth`);
    await db.execute(sql`DELETE FROM trainers`);
    app = await buildApp({ db, cookieSecret: 'x'.repeat(40), isProd: false });
  });
  afterAll(async () => {
    await pg.end();
  });

  it('тренер B не видит диалог/сообщения клиента A → 404; список диалогов B пуст; без auth → 401', async () => {
    const sidA = await registerTrainer('a@b.co');
    const sidB = await registerTrainer('b@b.co');
    const clientA = await createClient(sidA);

    // A пишет клиенту A
    const sent = await app.inject({
      method: 'POST',
      url: `/api/clients/${clientA}/messages`,
      cookies: { sid: sidA },
      payload: { body: 'личное сообщение' },
    });
    expect(sent.statusCode).toBe(201);
    const mid = sent.json<MessageResp>().message.id;

    // B читает сообщения клиента A → 404 (requireClientAccess: чужой клиент)
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/clients/${clientA}/messages`,
          cookies: { sid: sidB },
        })
      ).statusCode,
    ).toBe(404);

    // B пишет клиенту A → 404
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/clients/${clientA}/messages`,
          cookies: { sid: sidB },
          payload: { body: 'чужак' },
        })
      ).statusCode,
    ).toBe(404);

    // B отмечает прочитанным диалог клиента A → 404
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/clients/${clientA}/messages/read`,
          cookies: { sid: sidB },
        })
      ).statusCode,
    ).toBe(404);

    // Список диалогов B пуст (диалог клиента A ему не виден)
    const convsB = await app.inject({
      method: 'GET',
      url: '/api/conversations',
      cookies: { sid: sidB },
    });
    expect(convsB.json<{ conversations: unknown[] }>().conversations).toHaveLength(0);

    // без auth → 401
    expect(
      (await app.inject({ method: 'GET', url: `/api/clients/${clientA}/messages` })).statusCode,
    ).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/conversations' })).statusCode).toBe(401);

    // A по-прежнему видит свой диалог и сообщение
    const listA = await app.inject({
      method: 'GET',
      url: `/api/clients/${clientA}/messages`,
      cookies: { sid: sidA },
    });
    expect(listA.json<{ messages: { id: string }[] }>().messages.map((m) => m.id)).toEqual([mid]);
    const convsA = await app.inject({
      method: 'GET',
      url: '/api/conversations',
      cookies: { sid: sidA },
    });
    expect(convsA.json<{ conversations: unknown[] }>().conversations).toHaveLength(1);
  });
});
