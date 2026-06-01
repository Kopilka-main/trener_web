import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql, eq } from 'drizzle-orm';
import { createDb } from './client.js';
import { trainers, clients, trainerClients, files } from './schema.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('files schema (integration)', () => {
  const { db, sql: pg } = createDb(url!);

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM files`);
    await db.execute(sql`DELETE FROM trainer_clients`);
    await db.execute(sql`DELETE FROM clients`);
    await db.execute(sql`DELETE FROM trainers`);
  });
  afterAll(async () => {
    await pg.end();
  });

  async function seedBase() {
    await db.insert(trainers).values({
      id: 'tr1',
      email: 't@b.co',
      passwordHash: 'h',
      firstName: 'Тр',
      lastName: 'Ен',
    });
    await db.insert(clients).values({ id: 'c1', firstName: 'Кли', lastName: 'Ент' });
    await db.insert(trainerClients).values({ trainerId: 'tr1', clientId: 'c1', status: 'active' });
  }

  it('хранит файл; clientId и originalName опциональны (null)', async () => {
    await seedBase();
    await db.insert(files).values({
      id: 'f1',
      trainerId: 'tr1',
      clientId: null,
      mime: 'image/png',
      sizeBytes: 1234,
      storagePath: 'tr1/_/f1.png',
    });

    const rows = await db.select().from(files).where(eq(files.id, 'f1'));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.trainerId).toBe('tr1');
    expect(rows[0]?.clientId).toBeNull();
    expect(rows[0]?.mime).toBe('image/png');
    expect(rows[0]?.sizeBytes).toBe(1234);
    expect(rows[0]?.storagePath).toBe('tr1/_/f1.png');
    expect(rows[0]?.originalName).toBeNull();
  });

  it('каскад: удаление тренера удаляет его файлы', async () => {
    await seedBase();
    await db.insert(files).values({
      id: 'f1',
      trainerId: 'tr1',
      clientId: 'c1',
      mime: 'image/png',
      sizeBytes: 10,
      storagePath: 'tr1/c1/f1.png',
    });

    await db.delete(trainers).where(eq(trainers.id, 'tr1'));

    const rows = await db.select().from(files);
    expect(rows).toHaveLength(0);
  });

  it('каскад: удаление клиента удаляет файлы, привязанные к нему', async () => {
    await seedBase();
    await db.insert(files).values({
      id: 'f1',
      trainerId: 'tr1',
      clientId: 'c1',
      mime: 'image/png',
      sizeBytes: 10,
      storagePath: 'tr1/c1/f1.png',
    });

    await db.delete(clients).where(eq(clients.id, 'c1'));

    const rows = await db.select().from(files);
    expect(rows).toHaveLength(0);
  });
});
