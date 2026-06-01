import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { trainers, clients, trainerClients, files } from '../../db/schema.js';
import { makeMedicalRepo, type CreateMedicalInput } from './medical.repo.js';
import { makeFilesRepo, type CreateFileInput } from '../files/files.repo.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('medical.repo (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  const repo = makeMedicalRepo(db);
  const filesRepo = makeFilesRepo(db);

  function fileInput(over: Partial<CreateFileInput> = {}): CreateFileInput {
    return {
      id: 'fA',
      trainerId: 'A',
      clientId: 'c1',
      mime: 'application/pdf',
      sizeBytes: 100,
      storagePath: 'A/c1/fA.pdf',
      originalName: 'doc.pdf',
      ...over,
    };
  }

  function recordInput(over: Partial<CreateMedicalInput> = {}): CreateMedicalInput {
    return {
      id: 'm1',
      trainerId: 'A',
      clientId: 'c1',
      date: '2026-06-01',
      note: 'аллергия',
      fileId: null,
      ...over,
    };
  }

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM medical_records`);
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

  it('create без файла: file=null (leftJoin)', async () => {
    const r = await repo.create(recordInput());
    expect(r.id).toBe('m1');
    expect(r.note).toBe('аллергия');
    expect(r.file).toBeNull();
    expect(r.createdAt).toBeInstanceOf(Date);
  });

  it('create с файлом: file-метаданные через leftJoin', async () => {
    await filesRepo.create(fileInput());
    const r = await repo.create(recordInput({ fileId: 'fA' }));
    expect(r.file?.id).toBe('fA');
    expect(r.file?.mime).toBe('application/pdf');
    expect(r.file?.sizeBytes).toBe(100);
    expect(r.file?.originalName).toBe('doc.pdf');
  });

  it('getForTrainer scoped по паре; null если чужой', async () => {
    await repo.create(recordInput());
    expect((await repo.getForTrainer('A', 'c1', 'm1'))?.id).toBe('m1');
    expect(await repo.getForTrainer('A', 'c2', 'm1')).toBeNull();
    expect(await repo.getForTrainer('B', 'c1', 'm1')).toBeNull();
  });

  it('listForClient сортирует по date desc; чужой — пусто', async () => {
    await repo.create(recordInput({ id: 'old', date: '2026-05-01' }));
    await repo.create(recordInput({ id: 'new', date: '2026-06-01' }));
    await repo.create(recordInput({ id: 'mid', date: '2026-05-15' }));
    const list = await repo.listForClient('A', 'c1');
    expect(list.map((r) => r.id)).toEqual(['new', 'mid', 'old']);
    expect(await repo.listForClient('B', 'c1')).toEqual([]);
  });

  it('update меняет date/note в scope пары; чужой → null', async () => {
    await repo.create(recordInput());
    expect(await repo.update('B', 'c1', 'm1', { note: 'x' })).toBeNull();
    const upd = await repo.update('A', 'c1', 'm1', { note: 'обновлено', date: '2026-07-01' });
    expect(upd?.note).toBe('обновлено');
    expect(upd?.date).toBe('2026-07-01');
  });

  it('remove без файла → { storagePath: null }; запись исчезает', async () => {
    await repo.create(recordInput());
    expect(await repo.remove('B', 'c1', 'm1')).toBeNull();
    const removed = await repo.remove('A', 'c1', 'm1');
    expect(removed).toEqual({ storagePath: null });
    expect(await repo.getForTrainer('A', 'c1', 'm1')).toBeNull();
  });

  it('remove с файлом → возвращает storagePath; строка files тоже удалена', async () => {
    await filesRepo.create(fileInput());
    await repo.create(recordInput({ fileId: 'fA' }));
    const removed = await repo.remove('A', 'c1', 'm1');
    expect(removed?.storagePath).toBe('A/c1/fA.pdf');
    const remaining = await db.select({ id: files.id }).from(files);
    expect(remaining).toHaveLength(0);
  });
});
