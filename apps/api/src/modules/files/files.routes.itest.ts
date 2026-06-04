import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createDb } from '../../db/client.js';
import { trainers } from '../../db/schema.js';
import { buildApp } from '../../app.js';
import { makeStorage } from '../../files/storage.js';
import { makeFilesRepo } from './files.repo.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('files routes (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  let app: Awaited<ReturnType<typeof buildApp>>;
  let uploadsDir: string;
  let sid: string;
  let trainerId: string;

  const repo = makeFilesRepo(db);
  const content = Buffer.from('бинарные байты файла', 'utf8');

  // Создаёт файл на диске (storage.save) и запись в БД (repo.create) для тренера.
  // Аплоад через multipart реализует Часть B; здесь тестируем только раздачу.
  async function seedFile(ownerTrainerId: string): Promise<string> {
    const storage = makeStorage(uploadsDir);
    const id = randomUUID();
    const saved = await storage.save(ownerTrainerId, null, id, 'png', content);
    await repo.create({
      id,
      trainerId: ownerTrainerId,
      clientId: null,
      accountId: null,
      mime: 'image/png',
      sizeBytes: saved.sizeBytes,
      storagePath: saved.storagePath,
      originalName: 'pic.png',
    });
    return id;
  }

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM files`);
    await db.execute(sql`DELETE FROM trainer_clients`);
    await db.execute(sql`DELETE FROM clients`);
    await db.execute(sql`DELETE FROM sessions_auth`);
    await db.execute(sql`DELETE FROM trainers`);
    uploadsDir = await mkdtemp(path.join(tmpdir(), 'trener-files-itest-'));
    app = await buildApp({ db, cookieSecret: 'x'.repeat(40), isProd: false, uploadsDir });
    const reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'a@b.co', password: 'longenough1', firstName: 'Тр', lastName: 'Ен' },
    });
    sid = reg.cookies.find((c) => c.name === 'sid')!.value;
    // Регистрация создаёт ровно одного тренера — его id владелец файлов.
    const [row] = await db.select({ id: trainers.id }).from(trainers).limit(1);
    trainerId = row!.id;
  });
  afterAll(async () => {
    await pg.end();
    await rm(uploadsDir, { recursive: true, force: true });
  });

  it('GET /api/files/:id отдаёт байты файла владельцу с правильным mime', async () => {
    const id = await seedFile(trainerId);
    const res = await app.inject({ method: 'GET', url: `/api/files/${id}`, cookies: { sid } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
    expect(Buffer.from(res.rawPayload).equals(content)).toBe(true);
  });

  it('GET несуществующего файла → 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/files/missing',
      cookies: { sid },
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET файла другого тренера → 404 (не раскрываем чужое)', async () => {
    // Чужой тренер B и его файл напрямую в БД/на диске.
    await db.insert(trainers).values({
      id: 'B',
      email: 'b@b.co',
      passwordHash: 'h',
      firstName: 'B',
      lastName: 'B',
    });
    const otherId = await seedFile('B');
    const res = await app.inject({
      method: 'GET',
      url: `/api/files/${otherId}`,
      cookies: { sid },
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET без auth → 401', async () => {
    const id = await seedFile(trainerId);
    const res = await app.inject({ method: 'GET', url: `/api/files/${id}` });
    expect(res.statusCode).toBe(401);
  });
});
