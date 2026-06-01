import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql, eq } from 'drizzle-orm';
import { createDb } from './client.js';
import { trainers, clients, trainerClients, files, medicalRecords } from './schema.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('medical_records schema (integration)', () => {
  const { db, sql: pg } = createDb(url!);

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM medical_records`);
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

  it('хранит запись медкарты; fileId опционален (null)', async () => {
    await seedBase();
    await db.insert(medicalRecords).values({
      id: 'm1',
      trainerId: 'tr1',
      clientId: 'c1',
      date: '2026-06-01',
      note: 'аллергия на пыльцу',
      fileId: null,
    });

    const rows = await db.select().from(medicalRecords).where(eq(medicalRecords.id, 'm1'));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.note).toBe('аллергия на пыльцу');
    expect(rows[0]?.fileId).toBeNull();
    expect(rows[0]?.createdAt).toBeInstanceOf(Date);
  });

  it('каскад: удаление клиента удаляет его медзаписи', async () => {
    await seedBase();
    await db.insert(medicalRecords).values({
      id: 'm1',
      trainerId: 'tr1',
      clientId: 'c1',
      date: '2026-06-01',
      note: 'n',
    });
    await db.delete(clients).where(eq(clients.id, 'c1'));
    expect(await db.select().from(medicalRecords)).toHaveLength(0);
  });

  it('FK set null: удаление файла обнуляет fileId, запись остаётся', async () => {
    await seedBase();
    await db.insert(files).values({
      id: 'f1',
      trainerId: 'tr1',
      clientId: 'c1',
      mime: 'application/pdf',
      sizeBytes: 10,
      storagePath: 'tr1/c1/f1.pdf',
    });
    await db.insert(medicalRecords).values({
      id: 'm1',
      trainerId: 'tr1',
      clientId: 'c1',
      date: '2026-06-01',
      note: 'n',
      fileId: 'f1',
    });

    await db.delete(files).where(eq(files.id, 'f1'));

    const rows = await db.select().from(medicalRecords).where(eq(medicalRecords.id, 'm1'));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.fileId).toBeNull();
  });
});
