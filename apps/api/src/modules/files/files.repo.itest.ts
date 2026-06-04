import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { trainers, clients, trainerClients } from '../../db/schema.js';
import { makeFilesRepo, type CreateFileInput } from './files.repo.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('files.repo (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  const repo = makeFilesRepo(db);

  const input: CreateFileInput = {
    id: 'f1',
    trainerId: 'A',
    clientId: 'c1',
    accountId: null,
    mime: 'image/png',
    sizeBytes: 1234,
    storagePath: 'A/c1/f1.png',
    originalName: 'photo.png',
  };

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM files`);
    await db.execute(sql`DELETE FROM trainer_clients`);
    await db.execute(sql`DELETE FROM clients`);
    await db.execute(sql`DELETE FROM trainers`);
    await db.insert(trainers).values([
      { id: 'A', email: 'a@b.co', passwordHash: 'h', firstName: 'A', lastName: 'A' },
      { id: 'B', email: 'b@b.co', passwordHash: 'h', firstName: 'B', lastName: 'B' },
    ]);
    await db.insert(clients).values([{ id: 'c1', firstName: 'Кл', lastName: 'А' }]);
    await db.insert(trainerClients).values([{ trainerId: 'A', clientId: 'c1', status: 'active' }]);
  });
  afterAll(async () => {
    await pg.end();
  });

  it('create вставляет файл со всеми полями', async () => {
    const f = await repo.create(input);
    expect(f.id).toBe('f1');
    expect(f.trainerId).toBe('A');
    expect(f.clientId).toBe('c1');
    expect(f.mime).toBe('image/png');
    expect(f.sizeBytes).toBe(1234);
    expect(f.storagePath).toBe('A/c1/f1.png');
    expect(f.originalName).toBe('photo.png');
    expect(f.createdAt).toBeInstanceOf(Date);
  });

  it('create с clientId/originalName = null сохраняет null', async () => {
    const f = await repo.create({
      ...input,
      id: 'f2',
      clientId: null,
      originalName: null,
      storagePath: 'A/_/f2.png',
    });
    expect(f.clientId).toBeNull();
    expect(f.originalName).toBeNull();
  });

  it('getForTrainer резолвит в scope тренера; null если чужой/не найден', async () => {
    await repo.create(input);
    expect((await repo.getForTrainer('A', 'f1'))?.id).toBe('f1');
    expect(await repo.getForTrainer('B', 'f1')).toBeNull();
    expect(await repo.getForTrainer('A', 'missing')).toBeNull();
  });

  it('delete удаляет в scope тренера и возвращает строку; чужой → null без удаления', async () => {
    await repo.create(input);
    expect(await repo.delete('B', 'f1')).toBeNull();
    const deleted = await repo.delete('A', 'f1');
    expect(deleted?.id).toBe('f1');
    expect(deleted?.storagePath).toBe('A/c1/f1.png');
    expect(await repo.getForTrainer('A', 'f1')).toBeNull();
  });
});
