import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDb } from '../../db/client.js';
import { buildApp } from '../../app.js';

const url = process.env.DATABASE_URL;

// Собирает multipart-тело с полем `photo` (по образцу progress-photos.isolation).
// Маленький буфер image/png — раздача проверяется по статусу, не по содержимому.
function buildAvatarMultipart(): { body: Buffer; contentType: string } {
  const boundary = '----avatar' + Math.random().toString(16).slice(2);
  const CRLF = '\r\n';
  const data = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  const chunks: Buffer[] = [
    Buffer.from(
      `--${boundary}${CRLF}Content-Disposition: form-data; name="photo"; filename="a.png"${CRLF}Content-Type: image/png${CRLF}${CRLF}`,
    ),
    data,
    Buffer.from(CRLF),
    Buffer.from(`--${boundary}--${CRLF}`),
  ];
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

describe.skipIf(!url)('avatars isolation (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  let app: Awaited<ReturnType<typeof buildApp>>;
  let uploadsDir: string;

  type Injected = Awaited<ReturnType<typeof app.inject>>;
  function cookie(res: Injected, name: string): string {
    const c = res.cookies.find((ck) => ck.name === name);
    if (!c) throw new Error(`нет cookie ${name}`);
    return c.value;
  }

  async function registerTrainer(email: string): Promise<string> {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email, password: 'longenough1', firstName: 'T', lastName: 'R' },
    });
    return cookie(reg, 'sid');
  }

  async function registerClient(email: string): Promise<{ sid: string; accountId: string }> {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/client/auth/register',
      payload: { email, password: 'longenough1', firstName: 'К', lastName: 'Л' },
    });
    return {
      sid: cookie(reg, 'client_sid'),
      accountId: reg.json<{ account: { id: string } }>().account.id,
    };
  }

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM client_sessions_auth`);
    await db.execute(sql`DELETE FROM client_accounts`);
    await db.execute(sql`DELETE FROM trainer_clients`);
    await db.execute(sql`DELETE FROM clients`);
    await db.execute(sql`DELETE FROM files`);
    await db.execute(sql`DELETE FROM sessions_auth`);
    await db.execute(sql`DELETE FROM trainers`);
    uploadsDir = await mkdtemp(path.join(tmpdir(), 'trener-avatars-iso-'));
    app = await buildApp({ db, cookieSecret: 'x'.repeat(40), isProd: false, uploadsDir });
    await app.ready();
  });
  afterAll(async () => {
    await pg.end();
    await rm(uploadsDir, { recursive: true, force: true });
  });

  it('аватар тренера: владелец видит файл, чужой тренер → 404', async () => {
    const sidA = await registerTrainer('ta@b.co');
    const sidB = await registerTrainer('tb@b.co');

    const { body, contentType } = buildAvatarMultipart();
    const up = await app.inject({
      method: 'POST',
      url: '/api/auth/me/avatar',
      cookies: { sid: sidA },
      payload: body,
      headers: { 'content-type': contentType },
    });
    expect(up.statusCode).toBe(200);
    const fileId = up.json<{ trainer: { avatarFileId: string | null } }>().trainer.avatarFileId;
    expect(fileId).toBeTruthy();

    // me возвращает avatarFileId
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { sid: sidA } });
    expect(me.json<{ trainer: { avatarFileId: string | null } }>().trainer.avatarFileId).toBe(
      fileId,
    );

    // владелец читает свой файл
    const own = await app.inject({
      method: 'GET',
      url: `/api/files/${fileId}`,
      cookies: { sid: sidA },
    });
    expect(own.statusCode).toBe(200);

    // чужой тренер → 404
    const other = await app.inject({
      method: 'GET',
      url: `/api/files/${fileId}`,
      cookies: { sid: sidB },
    });
    expect(other.statusCode).toBe(404);
  });

  it('аватар клиента: POST → GET 200; без client_sid → 401', async () => {
    const { sid } = await registerClient('ca@b.co');

    // нет фото → 404
    const empty = await app.inject({
      method: 'GET',
      url: '/api/client/auth/me/avatar',
      cookies: { client_sid: sid },
    });
    expect(empty.statusCode).toBe(404);

    const { body, contentType } = buildAvatarMultipart();
    const up = await app.inject({
      method: 'POST',
      url: '/api/client/auth/me/avatar',
      cookies: { client_sid: sid },
      payload: body,
      headers: { 'content-type': contentType },
    });
    expect(up.statusCode).toBe(200);
    expect(
      up.json<{ account: { avatarFileId: string | null } }>().account.avatarFileId,
    ).toBeTruthy();

    // владелец читает свой аватар
    const get = await app.inject({
      method: 'GET',
      url: '/api/client/auth/me/avatar',
      cookies: { client_sid: sid },
    });
    expect(get.statusCode).toBe(200);

    // без сессии → 401
    const noAuth = await app.inject({ method: 'GET', url: '/api/client/auth/me/avatar' });
    expect(noAuth.statusCode).toBe(401);
  });

  it('аватар тренера клиенту: 409 до привязки; 200 после загрузки; 404 без фото', async () => {
    const tSid = await registerTrainer('coach@b.co');
    const { sid: cSid, accountId } = await registerClient('client@b.co');

    // до привязки → 409
    const before = await app.inject({
      method: 'GET',
      url: '/api/client/trainer/avatar',
      cookies: { client_sid: cSid },
    });
    expect(before.statusCode).toBe(409);

    // тренер привязывает клиента
    await app.inject({
      method: 'POST',
      url: '/api/clients',
      cookies: { sid: tSid },
      payload: { firstName: 'Кли', lastName: 'Ент', accountId },
    });

    // привязан, но тренер ещё без фото → 404
    const noPhoto = await app.inject({
      method: 'GET',
      url: '/api/client/trainer/avatar',
      cookies: { client_sid: cSid },
    });
    expect(noPhoto.statusCode).toBe(404);

    // публичный профиль тренера ещё без avatarFileId
    const card0 = await app.inject({
      method: 'GET',
      url: '/api/client/trainer',
      cookies: { client_sid: cSid },
    });
    expect(
      card0.json<{ trainer: { avatarFileId: string | null } }>().trainer.avatarFileId,
    ).toBeNull();

    // тренер грузит фото
    const { body, contentType } = buildAvatarMultipart();
    await app.inject({
      method: 'POST',
      url: '/api/auth/me/avatar',
      cookies: { sid: tSid },
      payload: body,
      headers: { 'content-type': contentType },
    });

    // публичный профиль теперь несёт avatarFileId
    const card1 = await app.inject({
      method: 'GET',
      url: '/api/client/trainer',
      cookies: { client_sid: cSid },
    });
    expect(
      card1.json<{ trainer: { avatarFileId: string | null } }>().trainer.avatarFileId,
    ).toBeTruthy();

    // клиент читает аватар тренера → 200
    const got = await app.inject({
      method: 'GET',
      url: '/api/client/trainer/avatar',
      cookies: { client_sid: cSid },
    });
    expect(got.statusCode).toBe(200);

    // без сессии → 401
    const noAuth = await app.inject({ method: 'GET', url: '/api/client/trainer/avatar' });
    expect(noAuth.statusCode).toBe(401);
  });
});
