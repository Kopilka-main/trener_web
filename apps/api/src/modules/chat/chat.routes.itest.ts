import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { buildApp } from '../../app.js';

const url = process.env.DATABASE_URL;

type ClientResp = { client: { id: string } };
type MessageResp = {
  message: { id: string; senderRole: string; body: string; createdAt: string };
};
type ConversationListResp = {
  conversations: { id: string; clientId: string; lastMessageAt: string | null }[];
};

describe.skipIf(!url)('chat routes (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  let app: Awaited<ReturnType<typeof buildApp>>;
  let sid: string;

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM messages`);
    await db.execute(sql`DELETE FROM conversations`);
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

  it('отправить сообщение → листинг показывает его → список диалогов содержит диалог', async () => {
    const cid = await createClient();

    const sent = await app.inject({
      method: 'POST',
      url: `/api/clients/${cid}/messages`,
      cookies: { sid },
      payload: { body: 'привет, как тренировка?' },
    });
    expect(sent.statusCode).toBe(201);
    const msg = sent.json<MessageResp>().message;
    expect(msg.senderRole).toBe('trainer');
    expect(msg.body).toBe('привет, как тренировка?');

    const list = await app.inject({
      method: 'GET',
      url: `/api/clients/${cid}/messages`,
      cookies: { sid },
    });
    expect(list.statusCode).toBe(200);
    const msgs = list.json<{ messages: { id: string }[] }>().messages;
    expect(msgs.map((m) => m.id)).toEqual([msg.id]);

    const convs = await app.inject({
      method: 'GET',
      url: '/api/conversations',
      cookies: { sid },
    });
    expect(convs.statusCode).toBe(200);
    const conv = convs.json<ConversationListResp>().conversations;
    expect(conv).toHaveLength(1);
    expect(conv[0]?.clientId).toBe(cid);
    expect(conv[0]?.lastMessageAt).not.toBeNull();
  });

  it('polling по ?sinceId возвращает только новые сообщения', async () => {
    const cid = await createClient();
    const first = await app.inject({
      method: 'POST',
      url: `/api/clients/${cid}/messages`,
      cookies: { sid },
      payload: { body: 'первое' },
    });
    const firstId = first.json<MessageResp>().message.id;
    const second = await app.inject({
      method: 'POST',
      url: `/api/clients/${cid}/messages`,
      cookies: { sid },
      payload: { body: 'второе' },
    });
    const secondId = second.json<MessageResp>().message.id;

    const poll = await app.inject({
      method: 'GET',
      url: `/api/clients/${cid}/messages?sinceId=${firstId}`,
      cookies: { sid },
    });
    expect(poll.json<{ messages: { id: string }[] }>().messages.map((m) => m.id)).toEqual([
      secondId,
    ]);
  });

  it('mark-read возвращает ok', async () => {
    const cid = await createClient();
    const res = await app.inject({
      method: 'POST',
      url: `/api/clients/${cid}/messages/read`,
      cookies: { sid },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ ok: boolean }>().ok).toBe(true);
  });

  it('отправка пустого тела → 400', async () => {
    const cid = await createClient();
    const res = await app.inject({
      method: 'POST',
      url: `/api/clients/${cid}/messages`,
      cookies: { sid },
      payload: { body: '   ' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('без auth → 401', async () => {
    const cid = await createClient();
    expect(
      (await app.inject({ method: 'GET', url: `/api/clients/${cid}/messages` })).statusCode,
    ).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/conversations' })).statusCode).toBe(401);
  });
});
