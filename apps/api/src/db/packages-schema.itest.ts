import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql, eq } from 'drizzle-orm';
import { createDb } from './client.js';
import { trainers, clients, trainerClients, paymentPackages } from './schema.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('payment_packages schema (integration)', () => {
  const { db, sql: pg } = createDb(url!);

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM payment_packages`);
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

  it('хранит пакет; выборка резолвит поля и дефолты', async () => {
    await seedBase();
    await db.insert(paymentPackages).values({
      id: 'p1',
      trainerId: 'tr1',
      clientId: 'c1',
      lessonsPaid: 10,
      pricePerLesson: 1500,
      totalPaid: 15000,
      startsAt: '2026-06-01',
    });

    const rows = await db.select().from(paymentPackages).where(eq(paymentPackages.id, 'p1'));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.trainerId).toBe('tr1');
    expect(rows[0]?.clientId).toBe('c1');
    expect(rows[0]?.lessonsPaid).toBe(10);
    expect(rows[0]?.pricePerLesson).toBe(1500);
    expect(rows[0]?.totalPaid).toBe(15000);
    expect(rows[0]?.startsAt).toBe('2026-06-01');
    expect(rows[0]?.status).toBe('active'); // default
    expect(rows[0]?.workoutType).toBeNull();
    expect(rows[0]?.note).toBeNull();
  });

  it('CHECK отклоняет неизвестный статус', async () => {
    await seedBase();
    await expect(
      db.insert(paymentPackages).values({
        id: 'pbad',
        trainerId: 'tr1',
        clientId: 'c1',
        lessonsPaid: 1,
        pricePerLesson: 1,
        totalPaid: 1,
        startsAt: '2026-06-01',
        status: 'bogus' as 'active',
      }),
    ).rejects.toThrow();
  });

  it('каскад: удаление клиента удаляет его пакеты', async () => {
    await seedBase();
    await db.insert(paymentPackages).values({
      id: 'p1',
      trainerId: 'tr1',
      clientId: 'c1',
      lessonsPaid: 5,
      pricePerLesson: 1000,
      totalPaid: 5000,
      startsAt: '2026-06-01',
    });

    await db.delete(clients).where(eq(clients.id, 'c1'));

    const rows = await db.select().from(paymentPackages);
    expect(rows).toHaveLength(0);
  });
});
