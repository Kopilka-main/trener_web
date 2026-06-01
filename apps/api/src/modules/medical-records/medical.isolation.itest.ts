import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDb } from '../../db/client.js';
import { buildApp } from '../../app.js';

const url = process.env.DATABASE_URL;

type ClientResp = { client: { id: string } };
type RecordResp = { record: { id: string; file: { id: string } | null } };

function buildMultipart(): { body: Buffer; contentType: string } {
  const boundary = '----iso' + Math.random().toString(16).slice(2);
  const CRLF = '\r\n';
  const data = Buffer.from([0x25, 0x50, 0x44, 0x46, 1, 2, 3]);
  const chunks: Buffer[] = [
    Buffer.from(
      `--${boundary}${CRLF}Content-Disposition: form-data; name="date"${CRLF}${CRLF}2026-06-01${CRLF}`,
    ),
    Buffer.from(
      `--${boundary}${CRLF}Content-Disposition: form-data; name="note"${CRLF}${CRLF}секрет А${CRLF}`,
    ),
    Buffer.from(
      `--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="a.pdf"${CRLF}Content-Type: application/pdf${CRLF}${CRLF}`,
    ),
    data,
    Buffer.from(CRLF),
    Buffer.from(`--${boundary}--${CRLF}`),
  ];
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

describe.skipIf(!url)('medical isolation (integration)', () => {
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
    await db.execute(sql`DELETE FROM medical_records`);
    await db.execute(sql`DELETE FROM files`);
    await db.execute(sql`DELETE FROM trainer_clients`);
    await db.execute(sql`DELETE FROM clients`);
    await db.execute(sql`DELETE FROM sessions_auth`);
    await db.execute(sql`DELETE FROM trainers`);
    uploadsDir = await mkdtemp(path.join(tmpdir(), 'trener-med-iso-'));
    app = await buildApp({ db, cookieSecret: 'x'.repeat(40), isProd: false, uploadsDir });
  });
  afterAll(async () => {
    await pg.end();
    await rm(uploadsDir, { recursive: true, force: true });
  });

  it('B → 404 на медзапись A; без auth → 401', async () => {
    const sidA = await registerTrainer('a@b.co');
    const sidB = await registerTrainer('b@b.co');
    const clientA = await createClient(sidA);
    const clientB = await createClient(sidB);

    const { body, contentType } = buildMultipart();
    const up = await app.inject({
      method: 'POST',
      url: `/api/clients/${clientA}/medical`,
      cookies: { sid: sidA },
      payload: body,
      headers: { 'content-type': contentType },
    });
    expect(up.statusCode).toBe(201);
    const created = up.json<RecordResp>().record;
    const fileId = created.file!.id;

    // B читает медзапись A под клиентом A → 404 (requireClientAccess: чужой клиент)
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/clients/${clientA}/medical/${created.id}`,
          cookies: { sid: sidB },
        })
      ).statusCode,
    ).toBe(404);

    // B подставляет своего клиента, чужой mid → 404 (scope в repo)
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/clients/${clientB}/medical/${created.id}`,
          cookies: { sid: sidB },
        })
      ).statusCode,
    ).toBe(404);

    // B не может пропатчить запись A → 404
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/clients/${clientA}/medical/${created.id}`,
          cookies: { sid: sidB },
          payload: { note: 'взлом' },
        })
      ).statusCode,
    ).toBe(404);

    // B не может удалить запись A → 404
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/api/clients/${clientA}/medical/${created.id}`,
          cookies: { sid: sidB },
        })
      ).statusCode,
    ).toBe(404);

    // B не видит файл A → 404
    expect(
      (await app.inject({ method: 'GET', url: `/api/files/${fileId}`, cookies: { sid: sidB } }))
        .statusCode,
    ).toBe(404);

    // B не видит запись A в своём scope
    const listB = await app.inject({
      method: 'GET',
      url: `/api/clients/${clientB}/medical`,
      cookies: { sid: sidB },
    });
    expect(listB.json<{ records: unknown[] }>().records).toHaveLength(0);

    // без auth → 401
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/clients/${clientA}/medical/${created.id}`,
        })
      ).statusCode,
    ).toBe(401);

    // A по-прежнему видит свою запись
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/clients/${clientA}/medical/${created.id}`,
          cookies: { sid: sidA },
        })
      ).statusCode,
    ).toBe(200);
  });
});
