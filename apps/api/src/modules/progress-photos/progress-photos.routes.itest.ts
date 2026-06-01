import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDb } from '../../db/client.js';
import { buildApp } from '../../app.js';

const url = process.env.DATABASE_URL;

type ClientResp = { client: { id: string } };
type PhotoResp = {
  photo: { id: string; angle: string; date: string; file: { id: string; mime: string } };
};

// Текстовое поле multipart.
type Field = { name: string; value: string };
// Файловая часть multipart.
type FilePart = { name: string; filename: string; contentType: string; data: Buffer };

// Собирает тело multipart/form-data вручную (без зависимости form-data).
function buildMultipart(
  fields: Field[],
  fileParts: FilePart[],
): { body: Buffer; contentType: string } {
  const boundary = '----trenerBoundary' + Math.random().toString(16).slice(2);
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

describe.skipIf(!url)('progress-photos routes (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  let app: Awaited<ReturnType<typeof buildApp>>;
  let uploadsDir: string;
  let sid: string;
  let clientId: string;

  const imgBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]); // псевдо-JPEG

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
    await db.execute(sql`DELETE FROM progress_photos`);
    await db.execute(sql`DELETE FROM files`);
    await db.execute(sql`DELETE FROM trainer_clients`);
    await db.execute(sql`DELETE FROM clients`);
    await db.execute(sql`DELETE FROM sessions_auth`);
    await db.execute(sql`DELETE FROM trainers`);
    uploadsDir = await mkdtemp(path.join(tmpdir(), 'trener-pp-itest-'));
    app = await buildApp({ db, cookieSecret: 'x'.repeat(40), isProd: false, uploadsDir });
    sid = await registerTrainer('a@b.co');
    clientId = await createClient(sid);
  });
  afterAll(async () => {
    await pg.end();
    await rm(uploadsDir, { recursive: true, force: true });
  });

  it('загрузка → list показывает фото → GET /api/files отдаёт байты → delete чистит', async () => {
    const { body, contentType } = buildMultipart(
      [
        { name: 'angle', value: 'front' },
        { name: 'date', value: '2026-06-01' },
        { name: 'note', value: 'до старта' },
      ],
      [{ name: 'photo', filename: 'shot.jpg', contentType: 'image/jpeg', data: imgBytes }],
    );

    const up = await app.inject({
      method: 'POST',
      url: `/api/clients/${clientId}/progress-photos`,
      cookies: { sid },
      payload: body,
      headers: { 'content-type': contentType },
    });
    expect(up.statusCode).toBe(201);
    const created = up.json<PhotoResp>().photo;
    expect(created.angle).toBe('front');
    expect(created.date).toBe('2026-06-01');
    expect(created.file.mime).toBe('image/jpeg');

    // list показывает фото
    const list = await app.inject({
      method: 'GET',
      url: `/api/clients/${clientId}/progress-photos`,
      cookies: { sid },
    });
    expect(list.statusCode).toBe(200);
    const photos = list.json<{ photos: { id: string }[] }>().photos;
    expect(photos.map((p) => p.id)).toContain(created.id);

    // GET /api/files/:fileId отдаёт ровно те байты
    const fileRes = await app.inject({
      method: 'GET',
      url: `/api/files/${created.file.id}`,
      cookies: { sid },
    });
    expect(fileRes.statusCode).toBe(200);
    expect(fileRes.headers['content-type']).toContain('image/jpeg');
    expect(Buffer.from(fileRes.rawPayload).equals(imgBytes)).toBe(true);

    // delete чистит запись и файл
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/clients/${clientId}/progress-photos/${created.id}`,
      cookies: { sid },
    });
    expect(del.statusCode).toBe(200);

    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/clients/${clientId}/progress-photos/${created.id}`,
          cookies: { sid },
        })
      ).statusCode,
    ).toBe(404);
    // файл тоже удалён (запись files ушла, GET /api/files → 404)
    expect(
      (await app.inject({ method: 'GET', url: `/api/files/${created.file.id}`, cookies: { sid } }))
        .statusCode,
    ).toBe(404);
  });

  it('неподдерживаемый mime → 400', async () => {
    const { body, contentType } = buildMultipart(
      [
        { name: 'angle', value: 'front' },
        { name: 'date', value: '2026-06-01' },
      ],
      [{ name: 'photo', filename: 'doc.pdf', contentType: 'application/pdf', data: imgBytes }],
    );
    const res = await app.inject({
      method: 'POST',
      url: `/api/clients/${clientId}/progress-photos`,
      cookies: { sid },
      payload: body,
      headers: { 'content-type': contentType },
    });
    expect(res.statusCode).toBe(400);
  });

  it('некорректный angle → 400', async () => {
    const { body, contentType } = buildMultipart(
      [
        { name: 'angle', value: 'diagonal' },
        { name: 'date', value: '2026-06-01' },
      ],
      [{ name: 'photo', filename: 'shot.jpg', contentType: 'image/jpeg', data: imgBytes }],
    );
    const res = await app.inject({
      method: 'POST',
      url: `/api/clients/${clientId}/progress-photos`,
      cookies: { sid },
      payload: body,
      headers: { 'content-type': contentType },
    });
    expect(res.statusCode).toBe(400);
  });
});
