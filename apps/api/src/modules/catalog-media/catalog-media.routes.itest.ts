import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDb } from '../../db/client.js';
import { buildApp } from '../../app.js';

const url = process.env.DATABASE_URL;

// Роут не обращается к БД (чистый fs), но buildApp требует подключение, поэтому
// тест гейтится по DATABASE_URL, как и прочие интеграционные.
describe.skipIf(!url)('catalog-media routes (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  let app: Awaited<ReturnType<typeof buildApp>>;
  let mediaDir: string;
  const png = Buffer.from('\x89PNG\r\n\x1a\nfake-png-bytes', 'binary');
  const mp4 = Buffer.from('\x00\x00\x00\x18ftypmp42fake-video-bytes-0123456789', 'binary');

  beforeAll(async () => {
    mediaDir = await mkdtemp(path.join(tmpdir(), 'trener-catalog-media-'));
    await writeFile(path.join(mediaDir, 'demo.png'), png);
    await writeFile(path.join(mediaDir, 'demo.mp4'), mp4);
    app = await buildApp({
      db,
      cookieSecret: 'x'.repeat(40),
      isProd: false,
      catalogMediaDir: mediaDir,
    });
  });
  afterAll(async () => {
    await app.close();
    await pg.end();
    await rm(mediaDir, { recursive: true, force: true });
  });

  it('GET существующего файла → 200 с image/png и байтами (публично, без auth)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/catalog-media/demo.png' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
    expect(Buffer.from(res.rawPayload).equals(png)).toBe(true);
  });

  it('GET без Range → Accept-Ranges и Content-Length (нужно видео на iOS)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/catalog-media/demo.mp4' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('video/mp4');
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(res.headers['content-length']).toBe(String(mp4.length));
  });

  it('GET с Range → 206 Partial Content с Content-Range и нужными байтами', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/catalog-media/demo.mp4',
      headers: { range: 'bytes=0-3' },
    });
    expect(res.statusCode).toBe(206);
    expect(res.headers['content-range']).toBe(`bytes 0-3/${mp4.length}`);
    expect(res.headers['content-length']).toBe('4');
    expect(Buffer.from(res.rawPayload).equals(mp4.subarray(0, 4))).toBe(true);
  });

  it('GET с Range без верхней границы → 206 до конца файла', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/catalog-media/demo.mp4',
      headers: { range: 'bytes=5-' },
    });
    expect(res.statusCode).toBe(206);
    expect(res.headers['content-range']).toBe(`bytes 5-${mp4.length - 1}/${mp4.length}`);
    expect(Buffer.from(res.rawPayload).equals(mp4.subarray(5))).toBe(true);
  });

  it('GET с недостижимым Range → 416', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/catalog-media/demo.mp4',
      headers: { range: `bytes=${mp4.length + 10}-` },
    });
    expect(res.statusCode).toBe(416);
    expect(res.headers['content-range']).toBe(`bytes */${mp4.length}`);
  });

  it('GET отсутствующего файла → 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/catalog-media/missing.png' });
    expect(res.statusCode).toBe(404);
  });

  it('GET с недопустимым расширением → 404', async () => {
    await writeFile(path.join(mediaDir, 'note.txt'), 'x');
    const res = await app.inject({ method: 'GET', url: '/api/catalog-media/note.txt' });
    expect(res.statusCode).toBe(404);
  });

  it('GET с path-traversal в имени → отклонён валидацией (400)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/catalog-media/..%2F..%2Fpackage.json',
    });
    expect(res.statusCode).toBe(400);
  });
});
