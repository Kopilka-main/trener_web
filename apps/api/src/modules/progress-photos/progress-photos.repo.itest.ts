import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { trainers, clients, trainerClients, files } from '../../db/schema.js';
import { makeProgressPhotosRepo, type CreatePhotoInput } from './progress-photos.repo.js';
import { makeFilesRepo, type CreateFileInput } from '../files/files.repo.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('progress-photos.repo (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  const repo = makeProgressPhotosRepo(db);
  const filesRepo = makeFilesRepo(db);

  function fileInput(over: Partial<CreateFileInput> = {}): CreateFileInput {
    return {
      id: 'fA',
      trainerId: 'A',
      clientId: 'c1',
      accountId: null,
      mime: 'image/jpeg',
      sizeBytes: 100,
      storagePath: 'A/c1/fA.jpg',
      originalName: 'p.jpg',
      ...over,
    };
  }

  function photoInput(over: Partial<CreatePhotoInput> = {}): CreatePhotoInput {
    return {
      id: 'p1',
      trainerId: 'A',
      clientId: 'c1',
      date: '2026-06-01',
      angle: 'front',
      fileId: 'fA',
      note: 'до',
      ...over,
    };
  }

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM progress_photos`);
    await db.execute(sql`DELETE FROM files`);
    await db.execute(sql`DELETE FROM trainer_clients`);
    await db.execute(sql`DELETE FROM clients`);
    await db.execute(sql`DELETE FROM trainers`);
    await db.insert(trainers).values([
      { id: 'A', email: 'a@b.co', passwordHash: 'h', firstName: 'A', lastName: 'A' },
      { id: 'B', email: 'b@b.co', passwordHash: 'h', firstName: 'B', lastName: 'B' },
    ]);
    await db.insert(clients).values([
      { id: 'c1', firstName: 'Кл', lastName: 'А' },
      { id: 'c2', firstName: 'Кл', lastName: 'Б' },
    ]);
    await db.insert(trainerClients).values([
      { trainerId: 'A', clientId: 'c1', status: 'active' },
      { trainerId: 'B', clientId: 'c2', status: 'active' },
    ]);
  });
  afterAll(async () => {
    await pg.end();
  });

  it('create вставляет фото и возвращает file-метаданные через join', async () => {
    await filesRepo.create(fileInput());
    const p = await repo.create(photoInput());
    expect(p.id).toBe('p1');
    expect(p.clientId).toBe('c1');
    expect(p.date).toBe('2026-06-01');
    expect(p.angle).toBe('front');
    expect(p.note).toBe('до');
    expect(p.createdAt).toBeInstanceOf(Date);
    expect(p.file.id).toBe('fA');
    expect(p.file.mime).toBe('image/jpeg');
    expect(p.file.sizeBytes).toBe(100);
    expect(p.file.originalName).toBe('p.jpg');
  });

  it('getForTrainer резолвит в scope пары; null если не принадлежит паре', async () => {
    await filesRepo.create(fileInput());
    await repo.create(photoInput());
    expect((await repo.getForTrainer('A', 'c1', 'p1'))?.id).toBe('p1');
    expect(await repo.getForTrainer('A', 'c2', 'p1')).toBeNull();
    expect(await repo.getForTrainer('B', 'c1', 'p1')).toBeNull();
  });

  it('listForClient сортирует по date desc; чужой — пусто', async () => {
    await filesRepo.create(fileInput({ id: 'f1', storagePath: 'A/c1/f1.jpg' }));
    await filesRepo.create(fileInput({ id: 'f2', storagePath: 'A/c1/f2.jpg' }));
    await filesRepo.create(fileInput({ id: 'f3', storagePath: 'A/c1/f3.jpg' }));
    await repo.create(photoInput({ id: 'old', date: '2026-05-01', fileId: 'f1' }));
    await repo.create(photoInput({ id: 'new', date: '2026-06-01', fileId: 'f2' }));
    await repo.create(photoInput({ id: 'mid', date: '2026-05-15', fileId: 'f3' }));
    const list = await repo.listForClient('A', 'c1');
    expect(list.map((p) => p.id)).toEqual(['new', 'mid', 'old']);
    expect(list[0]?.file.id).toBe('f2');
    expect(await repo.listForClient('B', 'c1')).toEqual([]);
  });

  it('remove удаляет в scope пары и возвращает storagePath; чужой → null', async () => {
    await filesRepo.create(fileInput());
    await repo.create(photoInput());
    expect(await repo.remove('B', 'c1', 'p1')).toBeNull();
    const removed = await repo.remove('A', 'c1', 'p1');
    expect(removed?.storagePath).toBe('A/c1/fA.jpg');
    expect(await repo.getForTrainer('A', 'c1', 'p1')).toBeNull();
    // Строка файла тоже удалена (каскад/прямое удаление).
    const remaining = await db.select({ id: files.id }).from(files);
    expect(remaining).toHaveLength(0);
  });
});
