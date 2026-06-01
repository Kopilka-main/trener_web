import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDb } from '../../db/client.js';
import { buildApp } from '../../app.js';

const url = process.env.DATABASE_URL;

type ClientResp = { client: { id: string } };
type RecordResp = {
  record: { id: string; date: string; note: string; file: { id: string; mime: string } | null };
};

type Field = { name: string; value: string };
type FilePart = { name: string; filename: string; contentType: string; data: Buffer };

function buildMultipart(
  fields: Field[],
  fileParts: FilePart[],
): { body: Buffer; contentType: string } {
  const boundary = '----medBoundary' + Math.random().toString(16).slice(2);
  const chunks: Buffer[] = [];
  const CRLF = '\r\n';

  for (const f of fields) {
    chunks.push(
      Buffer.from(
        `--${boundary}${CRLF}Content-Disposition: form-data; name="${f.name}"${CRLF}${CRLF}${f.value}${CRLF}`,
      ),
    );
  }
  for (const fp of fileParts) {
    chunks.push(
      Buffer.from(
        `--${boundary}${CRLF}Content-Disposition: form-data; name="${fp.name}"; filename="${fp.filename}"${CRLF}Content-Type: ${fp.contentType}${CRLF}${CRLF}`,
      ),
    );
    chunks.push(fp.data);
    chunks.push(Buffer.from(CRLF));
  }
  chunks.push(Buffer.from(`--${boundary}--${CRLF}`));

  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

describe.skipIf(!url)('medical routes (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  let app: Awaited<ReturnType<typeof buildApp>>;
  let uploadsDir: string;
  let sid: string;
  let clientId: string;

  const pdfBytes = Buffer.from([0x25, 0x50, 0x44, 0x46, 1, 2, 3, 4, 5]); // %PDF...

  async function registerTrainer(email: string): Promise<string> {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email, password: 'longenough1', firstName: 'T', lastName: 'R' },
    });
    return reg.cookies.find((c) => c.name === 'sid')!.value;
  }

  async function createClient(s: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/clients',
      cookies: { sid: s },
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
    uploadsDir = await mkdtemp(path.join(tmpdir(), 'trener-med-itest-'));
    app = await buildApp({ db, cookieSecret: 'x'.repeat(40), isProd: false, uploadsDir });
    sid = await registerTrainer('a@b.co');
    clientId = await createClient(sid);
  });
  afterAll(async () => {
    await pg.end();
    await rm(uploadsDir, { recursive: true, force: true });
  });

  it('создание с pdf-файлом → list → скачать файл → patch note → delete чистит файл', async () => {
    const { body, contentType } = buildMultipart(
      [
        { name: 'date', value: '2026-06-01' },
        { name: 'note', value: 'аллергия на пыльцу' },
      ],
      [{ name: 'file', filename: 'doc.pdf', contentType: 'application/pdf', data: pdfBytes }],
    );
    const up = await app.inject({
      method: 'POST',
      url: `/api/clients/${clientId}/medical`,
      cookies: { sid },
      payload: body,
      headers: { 'content-type': contentType },
    });
    expect(up.statusCode).toBe(201);
    const created = up.json<RecordResp>().record;
    expect(created.note).toBe('аллергия на пыльцу');
    expect(created.file?.mime).toBe('application/pdf');
    const fileId = created.file!.id;

    // list
    const list = await app.inject({
      method: 'GET',
      url: `/api/clients/${clientId}/medical`,
      cookies: { sid },
    });
    expect(list.json<{ records: { id: string }[] }>().records.map((r) => r.id)).toContain(
      created.id,
    );

    // скачать файл
    const fileRes = await app.inject({
      method: 'GET',
      url: `/api/files/${fileId}`,
      cookies: { sid },
    });
    expect(fileRes.statusCode).toBe(200);
    expect(fileRes.headers['content-type']).toContain('application/pdf');
    expect(Buffer.from(fileRes.rawPayload).equals(pdfBytes)).toBe(true);

    // patch note
    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/clients/${clientId}/medical/${created.id}`,
      cookies: { sid },
      payload: { note: 'обновлённая заметка' },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json<RecordResp>().record.note).toBe('обновлённая заметка');
    // файл сохранён после patch
    expect(patch.json<RecordResp>().record.file?.id).toBe(fileId);

    // delete чистит запись и файл
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/clients/${clientId}/medical/${created.id}`,
      cookies: { sid },
    });
    expect(del.statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/clients/${clientId}/medical/${created.id}`,
          cookies: { sid },
        })
      ).statusCode,
    ).toBe(404);
    // файл тоже удалён
    expect(
      (await app.inject({ method: 'GET', url: `/api/files/${fileId}`, cookies: { sid } }))
        .statusCode,
    ).toBe(404);
  });

  it('создание без файла → file null; delete не падает', async () => {
    const { body, contentType } = buildMultipart(
      [
        { name: 'date', value: '2026-06-02' },
        { name: 'note', value: 'без вложения' },
      ],
      [],
    );
    const up = await app.inject({
      method: 'POST',
      url: `/api/clients/${clientId}/medical`,
      cookies: { sid },
      payload: body,
      headers: { 'content-type': contentType },
    });
    expect(up.statusCode).toBe(201);
    const created = up.json<RecordResp>().record;
    expect(created.file).toBeNull();

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/clients/${clientId}/medical/${created.id}`,
      cookies: { sid },
    });
    expect(del.statusCode).toBe(200);
  });

  it('неподдерживаемый mime → 400', async () => {
    const { body, contentType } = buildMultipart(
      [
        { name: 'date', value: '2026-06-01' },
        { name: 'note', value: 'x' },
      ],
      [{ name: 'file', filename: 'a.zip', contentType: 'application/zip', data: pdfBytes }],
    );
    const res = await app.inject({
      method: 'POST',
      url: `/api/clients/${clientId}/medical`,
      cookies: { sid },
      payload: body,
      headers: { 'content-type': contentType },
    });
    expect(res.statusCode).toBe(400);
  });

  it('пустой note → 400', async () => {
    const { body, contentType } = buildMultipart(
      [
        { name: 'date', value: '2026-06-01' },
        { name: 'note', value: '   ' },
      ],
      [],
    );
    const res = await app.inject({
      method: 'POST',
      url: `/api/clients/${clientId}/medical`,
      cookies: { sid },
      payload: body,
      headers: { 'content-type': contentType },
    });
    expect(res.statusCode).toBe(400);
  });
});
