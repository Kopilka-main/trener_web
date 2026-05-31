import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql, eq } from 'drizzle-orm';
import { createDb } from './client.js';
import {
  trainers,
  clients,
  trainerClients,
  exercises,
  clientWorkouts,
  clientWorkoutExercises,
  clientWorkoutSets,
} from './schema.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('client_workouts schema (integration)', () => {
  const { db, sql: pg } = createDb(url!);

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM client_workout_sets`);
    await db.execute(sql`DELETE FROM client_workout_exercises`);
    await db.execute(sql`DELETE FROM client_workouts`);
    await db.execute(sql`DELETE FROM exercises`);
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
    await db.insert(exercises).values({
      id: 'ex1',
      trainerId: 'tr1',
      name: 'Жим лёжа',
      category: 'Грудь',
    });
  }

  it('хранит тренировку с упражнением и подходами; выборка резолвит вложенность', async () => {
    await seedBase();
    await db.insert(clientWorkouts).values({
      id: 'w1',
      trainerId: 'tr1',
      clientId: 'c1',
      name: 'Тренировка А',
    });
    await db
      .insert(clientWorkoutExercises)
      .values({ workoutId: 'w1', position: 0, exerciseId: 'ex1' });
    await db.insert(clientWorkoutSets).values([
      {
        workoutId: 'w1',
        exercisePosition: 0,
        setIndex: 0,
        plannedReps: 10,
        plannedWeightKg: 60.5,
        plannedRestSec: 120,
      },
      {
        workoutId: 'w1',
        exercisePosition: 0,
        setIndex: 1,
        plannedReps: 8,
        plannedWeightKg: 65,
      },
    ]);

    const ws = await db.select().from(clientWorkouts);
    expect(ws).toHaveLength(1);
    expect(ws[0]?.trainerId).toBe('tr1');
    expect(ws[0]?.clientId).toBe('c1');
    expect(ws[0]?.status).toBe('draft'); // default
    expect(ws[0]?.sourceTemplateId).toBeNull();

    const exs = await db
      .select()
      .from(clientWorkoutExercises)
      .where(eq(clientWorkoutExercises.workoutId, 'w1'));
    expect(exs).toHaveLength(1);
    expect(exs[0]?.position).toBe(0);
    expect(exs[0]?.exerciseId).toBe('ex1');

    const sets = await db
      .select()
      .from(clientWorkoutSets)
      .where(eq(clientWorkoutSets.workoutId, 'w1'));
    expect(sets).toHaveLength(2);
    expect(sets[0]?.plannedReps).toBe(10);
    expect(sets[0]?.plannedWeightKg).toBe(60.5);
    expect(sets[0]?.plannedRestSec).toBe(120);
    expect(sets[0]?.done).toBe(0); // default
  });

  it('каскад: удаление тренировки удаляет её упражнения и подходы', async () => {
    await seedBase();
    await db.insert(clientWorkouts).values({
      id: 'w1',
      trainerId: 'tr1',
      clientId: 'c1',
      name: 'Тренировка А',
    });
    await db
      .insert(clientWorkoutExercises)
      .values({ workoutId: 'w1', position: 0, exerciseId: 'ex1' });
    await db
      .insert(clientWorkoutSets)
      .values({ workoutId: 'w1', exercisePosition: 0, setIndex: 0, plannedReps: 10 });

    await db.delete(clientWorkouts).where(eq(clientWorkouts.id, 'w1'));

    const exs = await db.select().from(clientWorkoutExercises);
    const sets = await db.select().from(clientWorkoutSets);
    expect(exs).toHaveLength(0);
    expect(sets).toHaveLength(0);
  });
});
