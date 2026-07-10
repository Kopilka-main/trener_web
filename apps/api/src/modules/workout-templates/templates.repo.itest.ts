import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { trainers, exercises, clients, trainerClients } from '../../db/schema.js';
import { makeTemplatesRepo } from './templates.repo.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('templates.repo (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  const repo = makeTemplatesRepo(db);

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM workout_templates`);
    await db.execute(sql`DELETE FROM client_workouts`);
    await db.execute(sql`DELETE FROM exercises`);
    await db.execute(sql`DELETE FROM trainer_clients`);
    await db.execute(sql`DELETE FROM clients`);
    await db.execute(sql`DELETE FROM trainers`);
    await db.insert(trainers).values([
      { id: 'A', email: 'a@b.co', passwordHash: 'h', firstName: 'A', lastName: 'A' },
      { id: 'B', email: 'b@b.co', passwordHash: 'h', firstName: 'B', lastName: 'B' },
    ]);
    // Клиент cl1 связан с тренером A (персональные шаблоны A могут ссылаться на него).
    await db.insert(clients).values({ id: 'cl1', firstName: 'Иван', lastName: 'Петров' });
    await db.insert(trainerClients).values({ trainerId: 'A', clientId: 'cl1' });
    await db.insert(exercises).values([
      // глобальная
      { id: 'g1', trainerId: null, name: 'Жим лёжа', category: 'Грудь', restSec: 90 },
      // личная A
      { id: 'a1', trainerId: 'A', name: 'Присед A', category: 'Ноги', restSec: 90 },
      // личная B
      { id: 'b1', trainerId: 'B', name: 'Тяга B', category: 'Спина', restSec: 90 },
    ]);
  });
  afterAll(async () => {
    await pg.end();
  });

  it('create вставляет позиции 0..n и резолвит exerciseName', async () => {
    const t = await repo.create('A', {
      id: 't1',
      trainerId: 'A',
      name: 'День ног',
      categoryTag: 'legs',
      exercises: [
        { exerciseId: 'g1', sets: 3, reps: 10, restSec: 90 },
        { exerciseId: 'a1', sets: 4, reps: 8, restSec: 120 },
      ],
    });
    expect(t).not.toBeNull();
    expect(t?.exercises.map((e) => e.position)).toEqual([0, 1]);
    expect(t?.exercises.map((e) => e.exerciseName)).toEqual(['Жим лёжа', 'Присед A']);
    expect(t?.exercises[1]?.sets).toBe(4);
  });

  it('create с невидимым упражнением чужого тренера → null (не вставляет)', async () => {
    const t = await repo.create('A', {
      id: 't2',
      trainerId: 'A',
      name: 'Плохой',
      exercises: [{ exerciseId: 'b1', sets: 3, restSec: 90 }],
    });
    expect(t).toBeNull();
    expect(await repo.getForTrainer('A', 't2')).toBeNull();
  });

  it('update заменяет список упражнений целиком', async () => {
    await repo.create('A', {
      id: 't1',
      trainerId: 'A',
      name: 'Старый',
      exercises: [{ exerciseId: 'g1', sets: 3, restSec: 90 }],
    });
    const upd = await repo.update('A', 't1', {
      name: 'Новый',
      exercises: [
        { exerciseId: 'a1', sets: 5, restSec: 60 },
        { exerciseId: 'g1', sets: 2, restSec: 90 },
      ],
    });
    expect(upd?.name).toBe('Новый');
    expect(upd?.exercises.map((e) => e.exerciseId)).toEqual(['a1', 'g1']);
    expect(upd?.exercises).toHaveLength(2);
  });

  it('update с невидимым упражнением → null', async () => {
    await repo.create('A', {
      id: 't1',
      trainerId: 'A',
      name: 'X',
      exercises: [{ exerciseId: 'g1', sets: 3, restSec: 90 }],
    });
    const upd = await repo.update('A', 't1', {
      exercises: [{ exerciseId: 'b1', sets: 3, restSec: 90 }],
    });
    expect(upd).toBeNull();
    // старый список не изменён
    const cur = await repo.getForTrainer('A', 't1');
    expect(cur?.exercises.map((e) => e.exerciseId)).toEqual(['g1']);
  });

  it('delete удаляет шаблон каскадом (позиции исчезают)', async () => {
    await repo.create('A', {
      id: 't1',
      trainerId: 'A',
      name: 'X',
      exercises: [{ exerciseId: 'g1', sets: 3, restSec: 90 }],
    });
    expect(await repo.delete('A', 't1')).toBe(true);
    expect(await repo.getForTrainer('A', 't1')).toBeNull();
    const cnt = await db.execute<{ c: number }>(
      sql`SELECT count(*)::int AS c FROM workout_template_exercises`,
    );
    expect(cnt[0]?.c).toBe(0);
  });

  it('персональный шаблон: create пишет clientId, get/list резолвят clientName через JOIN', async () => {
    const personal = await repo.create('A', {
      id: 'p1',
      trainerId: 'A',
      clientId: 'cl1',
      name: 'Персональный',
      exercises: [{ exerciseId: 'g1', sets: 3, restSec: 90 }],
    });
    expect(personal?.clientId).toBe('cl1');
    expect(personal?.clientName).toBe('Иван Петров');

    // Общий шаблон (без clientId) → clientId/clientName null.
    const general = await repo.create('A', {
      id: 'g0',
      trainerId: 'A',
      name: 'Общий',
      exercises: [{ exerciseId: 'g1', sets: 3, restSec: 90 }],
    });
    expect(general?.clientId).toBeNull();
    expect(general?.clientName).toBeNull();

    const got = await repo.getForTrainer('A', 'p1');
    expect(got?.clientId).toBe('cl1');
    expect(got?.clientName).toBe('Иван Петров');

    const list = await repo.listByTrainer('A');
    const byId = new Map(list.map((t) => [t.id, t]));
    expect(byId.get('p1')?.clientName).toBe('Иван Петров');
    expect(byId.get('g0')?.clientId).toBeNull();
  });

  it('isClientLinked: true для связанного, false для чужого/несуществующего', async () => {
    expect(await repo.isClientLinked('A', 'cl1')).toBe(true);
    expect(await repo.isClientLinked('B', 'cl1')).toBe(false);
    expect(await repo.isClientLinked('A', 'nope')).toBe(false);
  });

  it('isolation: B не видит/не правит/не удаляет шаблон A', async () => {
    await repo.create('A', {
      id: 't1',
      trainerId: 'A',
      name: 'X',
      exercises: [{ exerciseId: 'g1', sets: 3, restSec: 90 }],
    });
    expect(await repo.getForTrainer('B', 't1')).toBeNull();
    expect(await repo.update('B', 't1', { name: 'hack' })).toBeNull();
    expect(await repo.delete('B', 't1')).toBe(false);
    expect(await repo.listByTrainer('B')).toEqual([]);
  });
});
