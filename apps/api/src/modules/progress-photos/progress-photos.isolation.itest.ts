import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDb } from '../../db/client.js';
import { buildApp } from '../../app.js';

const url = process.env.DATABASE_URL;

type ClientResp = { client: { id: string } };
type PhotoResp = { photo: { id: string; file: { id: string } } };

function buildMultipart(): { body: Buffer; contentType: string } {
  const boundary = '----iso' + Math.random().toString(16).slice(2);
  const CRLF = '\r\n';
  const data = Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]);
  const chunks: Buffer[] = [
    Buffer.from(
      `--${boundary}${CRLF}Content-Disposition: form-data; name="angle"${CRLF}${CRLF}front${CRLF}`,
    ),
    Buffer.from(
      `--${boundary}${CRLF}Content-Disposition: form-data; name="date"${CRLF}${CRLF}2026-06-01${CRLF}`,
    ),
    Buffer.from(
      `--${boundary}${CRLF}Content-Disposition: form-data; name="photo"; filename="s.jpg"${CRLF}Content-Type: image/jpeg${CRLF}${CRLF}`,
    ),
    data,
    Buffer.from(CRLF),
    Buffer.from(`--${boundary}--${CRLF}`),
  ];
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

describe.skipIf(!url)('progress-photos isolation (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  let app: Awaited<ReturnType<typeof buildApp>>;
  let uploadsDir: string;

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
    await db.execute(sql`DELETE FROM progress_photos`);
    await db.execute(sql`DELETE FROM files`);
    await db.execute(sql`DELETE FROM trainer_clients`);
    await db.execute(sql`DELETE FROM clients`);
    await db.execute(sql`DELETE FROM sessions_auth`);
    await db.execute(sql`DELETE FROM trainers`);
    uploadsDir = await mkdtemp(path.join(tmpdir(), 'trener-pp-iso-'));
    app = await buildApp({ db, cookieSecret: 'x'.repeat(40), isProd: false, uploadsDir });
  });
  afterAll(async () => {
    await pg.end();
    await rm(uploadsDir, { recursive: true, force: true });
  });

  it('B → 404 на фото A; без auth → 401; неподдерживаемый mime → 400', async () => {
    const sidA = await registerTrainer('a@b.co');
    const sidB = await registerTrainer('b@b.co');
    const clientA = await createClient(sidA);
    const clientB = await createClient(sidB);

    const { body, contentType } = buildMultipart();
    const up = await app.inject({
      method: 'POST',
      url: `/api/clients/${clientA}/progress-photos`,
      cookies: { sid: sidA },
      payload: body,
      headers: { 'content-type': contentType },
    });
    expect(up.statusCode).toBe(201);
    const created = up.json<PhotoResp>().photo;

    // B читает фото A под клиентом A → 404 (requireClientAccess: чужой клиент)
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/clients/${clientA}/progress-photos/${created.id}`,
          cookies: { sid: sidB },
        })
      ).statusCode,
    ).toBe(404);

    // B подставляет своего клиента, чужой pid → 404 (scope в repo)
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/clients/${clientB}/progress-photos/${created.id}`,
          cookies: { sid: sidB },
        })
      ).statusCode,
    ).toBe(404);

    // B не может удалить фото A → 404
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/api/clients/${clientA}/progress-photos/${created.id}`,
          cookies: { sid: sidB },
        })
      ).statusCode,
    ).toBe(404);

    // B не видит файл A → 404
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/files/${created.file.id}`,
          cookies: { sid: sidB },
        })
      ).statusCode,
    ).toBe(404);

    // B не видит фото A в своём scope
    const listB = await app.inject({
      method: 'GET',
      url: `/api/clients/${clientB}/progress-photos`,
      cookies: { sid: sidB },
    });
    expect(listB.json<{ photos: unknown[] }>().photos).toHaveLength(0);

    // без auth → 401
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/clients/${clientA}/progress-photos/${created.id}`,
        })
      ).statusCode,
    ).toBe(401);

    // неподдерживаемый mime → 400
    const boundary = '----bad' + Math.random().toString(16).slice(2);
    const CRLF = '\r\n';
    const badBody = Buffer.concat([
      Buffer.from(
        `--${boundary}${CRLF}Content-Disposition: form-data; name="angle"${CRLF}${CRLF}front${CRLF}`,
      ),
      Buffer.from(
        `--${boundary}${CRLF}Content-Disposition: form-data; name="date"${CRLF}${CRLF}2026-06-01${CRLF}`,
      ),
      Buffer.from(
        `--${boundary}${CRLF}Content-Disposition: form-data; name="photo"; filename="d.pdf"${CRLF}Content-Type: application/pdf${CRLF}${CRLF}`,
      ),
      Buffer.from([1, 2, 3]),
      Buffer.from(CRLF),
      Buffer.from(`--${boundary}--${CRLF}`),
    ]);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/clients/${clientA}/progress-photos`,
          cookies: { sid: sidA },
          payload: badBody,
          headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
        })
      ).statusCode,
    ).toBe(400);

    // A по-прежнему видит своё фото
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/clients/${clientA}/progress-photos/${created.id}`,
          cookies: { sid: sidA },
        })
      ).statusCode,
    ).toBe(200);
  });
});
