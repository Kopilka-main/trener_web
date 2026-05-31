import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql, eq } from 'drizzle-orm';
import { createDb } from './client.js';
import { trainers, clients, trainerClients, clientWorkouts, sessions } from './schema.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('sessions schema (integration)', () => {
  const { db, sql: pg } = createDb(url!);

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM sessions`);
    await db.execute(sql`DELETE FROM client_workouts`);
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

  it('хранит занятие тренера со связанным клиентом; выборка резолвит поля и дефолты', async () => {
    await seedBase();
    await db.insert(sessions).values({
      id: 's1',
      trainerId: 'tr1',
      clientId: 'c1',
      date: '2026-06-01',
      startTime: '09:30',
    });

    const rows = await db.select().from(sessions).where(eq(sessions.id, 's1'));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.trainerId).toBe('tr1');
    expect(rows[0]?.clientId).toBe('c1');
    expect(rows[0]?.date).toBe('2026-06-01');
    expect(rows[0]?.startTime).toBe('09:30');
    expect(rows[0]?.durationMin).toBe(60); // default
    expect(rows[0]?.status).toBe('planned'); // default
    expect(rows[0]?.isOnline).toBe(0); // default
    expect(rows[0]?.workoutId).toBeNull();
    expect(rows[0]?.location).toBeNull();
    expect(rows[0]?.title).toBeNull();
  });

  it('допускает привязку к тренировке клиента; set null при удалении тренировки', async () => {
    await seedBase();
    await db
      .insert(clientWorkouts)
      .values({ id: 'w1', trainerId: 'tr1', clientId: 'c1', name: 'Тренировка А' });
    await db.insert(sessions).values({
      id: 's1',
      trainerId: 'tr1',
      clientId: 'c1',
      workoutId: 'w1',
      date: '2026-06-02',
      startTime: '10:00',
      durationMin: 45,
      location: 'Зал 1',
      title: 'Утреннее занятие',
      status: 'completed',
      isOnline: 1,
      note: 'хорошо',
    });

    const before = await db.select().from(sessions).where(eq(sessions.id, 's1'));
    expect(before[0]?.workoutId).toBe('w1');
    expect(before[0]?.durationMin).toBe(45);
    expect(before[0]?.status).toBe('completed');
    expect(before[0]?.isOnline).toBe(1);

    await db.delete(clientWorkouts).where(eq(clientWorkouts.id, 'w1'));

    const after = await db.select().from(sessions).where(eq(sessions.id, 's1'));
    expect(after).toHaveLength(1);
    expect(after[0]?.workoutId).toBeNull(); // set null
  });

  it('каскад: удаление клиента удаляет его занятия', async () => {
    await seedBase();
    await db.insert(sessions).values({
      id: 's1',
      trainerId: 'tr1',
      clientId: 'c1',
      date: '2026-06-03',
      startTime: '11:00',
    });

    await db.delete(clients).where(eq(clients.id, 'c1'));

    const rows = await db.select().from(sessions);
    expect(rows).toHaveLength(0);
  });
});
