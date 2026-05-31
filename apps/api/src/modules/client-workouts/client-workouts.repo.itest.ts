import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { trainers, clients, trainerClients, exercises } from '../../db/schema.js';
import { makeClientWorkoutsRepo, type CreateWorkoutInput } from './client-workouts.repo.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('client-workouts.repo (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  const repo = makeClientWorkoutsRepo(db);

  const plan: CreateWorkoutInput = {
    id: 'w1',
    name: 'День груди',
    exercises: [
      {
        exerciseId: 'g1',
        sets: [
          { plannedReps: 10, plannedRestSec: 90 },
          { plannedReps: 8, plannedRestSec: 120 },
        ],
      },
      { exerciseId: 'a1', sets: [{ plannedTimeSec: 60 }] },
    ],
  };

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM client_workouts`);
    await db.execute(sql`DELETE FROM trainer_clients`);
    await db.execute(sql`DELETE FROM clients`);
    await db.execute(sql`DELETE FROM exercises`);
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
    await db.insert(exercises).values([
      { id: 'g1', trainerId: null, name: 'Жим лёжа', category: 'Грудь', restSec: 90 },
      { id: 'a1', trainerId: 'A', name: 'Присед A', category: 'Ноги', restSec: 90 },
      { id: 'b1', trainerId: 'B', name: 'Тяга B', category: 'Спина', restSec: 90 },
    ]);
  });
  afterAll(async () => {
    await pg.end();
  });

  it('create вставляет упражнения (позиции) и подходы (planned), статус draft', async () => {
    const w = await repo.create('A', 'c1', plan);
    expect(w).not.toBeNull();
    expect(w?.status).toBe('draft');
    expect(w?.exercises.map((e) => e.position)).toEqual([0, 1]);
    expect(w?.exercises.map((e) => e.exerciseName)).toEqual(['Жим лёжа', 'Присед A']);
    expect(w?.exercises[0]?.sets.map((s) => s.setIndex)).toEqual([0, 1]);
    expect(w?.exercises[0]?.sets[1]?.plannedReps).toBe(8);
    expect(w?.exercises[0]?.sets[1]?.plannedRestSec).toBe(120);
    expect(w?.exercises[1]?.sets[0]?.plannedTimeSec).toBe(60);
    expect(w?.exercises[0]?.sets[0]?.done).toBe(false);
  });

  it('create с невидимым упражнением чужого тренера → null (не вставляет)', async () => {
    const w = await repo.create('A', 'c1', {
      id: 'wbad',
      name: 'Плохой',
      exercises: [{ exerciseId: 'b1', sets: [{}] }],
    });
    expect(w).toBeNull();
    expect(await repo.getFull('A', 'c1', 'wbad')).toBeNull();
  });

  it('getFull резолвит вложенность; null если не принадлежит паре', async () => {
    await repo.create('A', 'c1', plan);
    const full = await repo.getFull('A', 'c1', 'w1');
    expect(full?.exercises).toHaveLength(2);
    expect(full?.exercises[0]?.sets).toHaveLength(2);
    // другой клиент / другой тренер
    expect(await repo.getFull('A', 'c2', 'w1')).toBeNull();
    expect(await repo.getFull('B', 'c1', 'w1')).toBeNull();
  });

  it('setStatusActive переводит в active + startedAt', async () => {
    await repo.create('A', 'c1', plan);
    const at = new Date('2026-05-31T10:00:00.000Z');
    expect(await repo.setStatusActive('A', 'c1', 'w1', at)).toBe(true);
    const full = await repo.getFull('A', 'c1', 'w1');
    expect(full?.status).toBe('active');
    expect(full?.startedAt?.toISOString()).toBe(at.toISOString());
    // чужой тренер не переводит
    expect(await repo.setStatusActive('B', 'c1', 'w1', at)).toBe(false);
  });

  it('updateSet фиксирует факт подхода', async () => {
    await repo.create('A', 'c1', plan);
    const upd = await repo.updateSet('A', 'c1', 'w1', 0, 1, {
      actualReps: 7,
      actualWeightKg: 80,
      done: true,
    });
    const set = upd?.exercises[0]?.sets[1];
    expect(set?.actualReps).toBe(7);
    expect(set?.actualWeightKg).toBe(80);
    expect(set?.done).toBe(true);
  });

  it('updateSet чужой пары → null; несуществующий подход → null', async () => {
    await repo.create('A', 'c1', plan);
    expect(await repo.updateSet('B', 'c1', 'w1', 0, 0, { done: true })).toBeNull();
    expect(await repo.updateSet('A', 'c1', 'w1', 5, 5, { done: true })).toBeNull();
  });

  it('complete переводит в completed + поля', async () => {
    await repo.create('A', 'c1', plan);
    const at = new Date('2026-05-31T11:00:00.000Z');
    expect(
      await repo.complete('A', 'c1', 'w1', { durationSec: 3600, rpe: 8, trainerNote: 'ок' }, at),
    ).toBe(true);
    const full = await repo.getFull('A', 'c1', 'w1');
    expect(full?.status).toBe('completed');
    expect(full?.completedAt?.toISOString()).toBe(at.toISOString());
    expect(full?.durationSec).toBe(3600);
    expect(full?.rpe).toBe(8);
    expect(full?.trainerNote).toBe('ок');
    expect(await repo.complete('B', 'c1', 'w1', {}, at)).toBe(false);
  });

  it('listForClient возвращает тренировки пары (desc createdAt)', async () => {
    await repo.create('A', 'c1', { ...plan, id: 'w1' });
    await repo.create('A', 'c1', { ...plan, id: 'w2' });
    const list = await repo.listForClient('A', 'c1');
    expect(list.map((w) => w.id)).toContain('w1');
    expect(list).toHaveLength(2);
    expect(await repo.listForClient('B', 'c1')).toEqual([]);
  });

  it('remove удаляет каскадом (упражнения и подходы исчезают)', async () => {
    await repo.create('A', 'c1', plan);
    expect(await repo.remove('A', 'c1', 'w1')).toBe(true);
    expect(await repo.getFull('A', 'c1', 'w1')).toBeNull();
    const ex = await db.execute<{ c: number }>(
      sql`SELECT count(*)::int AS c FROM client_workout_exercises`,
    );
    const st = await db.execute<{ c: number }>(
      sql`SELECT count(*)::int AS c FROM client_workout_sets`,
    );
    expect(ex[0]?.c).toBe(0);
    expect(st[0]?.c).toBe(0);
    // чужой не удаляет
    expect(await repo.remove('B', 'c1', 'w1')).toBe(false);
  });
});
