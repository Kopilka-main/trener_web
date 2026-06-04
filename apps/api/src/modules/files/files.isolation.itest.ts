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

describe.skipIf(!url)('files isolation (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  let app: Awaited<ReturnType<typeof buildApp>>;
  let uploadsDir: string;
  const repo = makeFilesRepo(db);

  async function registerTrainer(email: string): Promise<{ sid: string; trainerId: string }> {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email, password: 'longenough1', firstName: 'Тр', lastName: 'Ен' },
    });
    const sid = reg.cookies.find((c) => c.name === 'sid')!.value;
    const [row] = await db
      .select({ id: trainers.id })
      .from(trainers)
      .where(sql`${trainers.email} = ${email}`);
    return { sid, trainerId: row!.id };
  }

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM files`);
    await db.execute(sql`DELETE FROM trainer_clients`);
    await db.execute(sql`DELETE FROM clients`);
    await db.execute(sql`DELETE FROM sessions_auth`);
    await db.execute(sql`DELETE FROM trainers`);
    uploadsDir = await mkdtemp(path.join(tmpdir(), 'trener-files-iso-'));
    app = await buildApp({ db, cookieSecret: 'x'.repeat(40), isProd: false, uploadsDir });
  });
  afterAll(async () => {
    await pg.end();
    await rm(uploadsDir, { recursive: true, force: true });
  });

  it('тренер B не может получить файл тренера A (→ 404)', async () => {
    const a = await registerTrainer('a@b.co');
    const b = await registerTrainer('b@b.co');

    const storage = makeStorage(uploadsDir);
    const id = randomUUID();
    const saved = await storage.save(a.trainerId, null, id, 'png', Buffer.from('A-секрет'));
    await repo.create({
      id,
      trainerId: a.trainerId,
      clientId: null,
      accountId: null,
      mime: 'image/png',
      sizeBytes: saved.sizeBytes,
      storagePath: saved.storagePath,
      originalName: null,
    });

    // Владелец A видит файл.
    const own = await app.inject({
      method: 'GET',
      url: `/api/files/${id}`,
      cookies: { sid: a.sid },
    });
    expect(own.statusCode).toBe(200);

    // Чужой B — 404.
    const foreign = await app.inject({
      method: 'GET',
      url: `/api/files/${id}`,
      cookies: { sid: b.sid },
    });
    expect(foreign.statusCode).toBe(404);
  });
});
