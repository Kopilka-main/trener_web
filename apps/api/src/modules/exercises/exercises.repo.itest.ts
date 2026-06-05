import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import {
  trainers,
  exercises,
  workoutTemplates,
  workoutTemplateExercises,
} from '../../db/schema.js';
import { makeExercisesRepo } from './exercises.repo.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('exercises.repo (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  const repo = makeExercisesRepo(db);

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM workout_template_exercises`);
    await db.execute(sql`DELETE FROM workout_templates`);
    await db.execute(sql`DELETE FROM client_workouts`);
    await db.execute(sql`DELETE FROM exercises`);
    await db.execute(sql`DELETE FROM trainers`);
    await db.insert(trainers).values([
      { id: 'A', email: 'a@b.co', passwordHash: 'h', firstName: 'A', lastName: 'A' },
      { id: 'B', email: 'b@b.co', passwordHash: 'h', firstName: 'B', lastName: 'B' },
    ]);
    // Глобальная системная запись (trainer_id IS NULL).
    await db
      .insert(exercises)
      .values({ id: 'g1', trainerId: null, name: 'Жим лёжа', category: 'Грудь', restSec: 90 });
  });
  afterAll(async () => {
    await pg.end();
  });

  it('list возвращает личные + глобальные, сортировка по name', async () => {
    await repo.create({ id: 'a1', trainerId: 'A', name: 'Присед', category: 'Ноги', restSec: 90 });
    const listA = await repo.list('A');
    expect(listA.map((r) => r.id)).toEqual(['g1', 'a1']); // «Жим лёжа» < «Присед»
    // B видит только глобальную (личное A не видит).
    const listB = await repo.list('B');
    expect(listB.map((r) => r.id)).toEqual(['g1']);
  });

  it('getVisible отдаёт глобальную и свою; getOwn — только свою', async () => {
    await repo.create({ id: 'a1', trainerId: 'A', name: 'Присед', category: 'Ноги', restSec: 90 });
    expect(await repo.getVisible('A', 'g1')).not.toBeNull();
    expect(await repo.getVisible('A', 'a1')).not.toBeNull();
    expect(await repo.getVisible('B', 'a1')).toBeNull(); // чужое личное невидимо

    expect(await repo.getOwn('A', 'a1')).not.toBeNull();
    expect(await repo.getOwn('A', 'g1')).toBeNull(); // глобальную getOwn не отдаёт
    expect(await repo.getOwn('B', 'a1')).toBeNull(); // чужое личное
  });

  it('update/delete не трогают глобальную и чужую (null/false)', async () => {
    await repo.create({ id: 'a1', trainerId: 'A', name: 'Присед', category: 'Ноги', restSec: 90 });
    // Глобальную нельзя править/удалять.
    expect(await repo.update('A', 'g1', { name: 'Hacked' })).toBeNull();
    expect(await repo.delete('A', 'g1')).toBe('not_found');
    // Чужую личную B не трогает.
    expect(await repo.update('B', 'a1', { name: 'Hacked' })).toBeNull();
    expect(await repo.delete('B', 'a1')).toBe('not_found');
    // Свою — можно.
    const upd = await repo.update('A', 'a1', { name: 'Присед со штангой' });
    expect(upd?.name).toBe('Присед со штангой');
    expect(await repo.delete('A', 'a1')).toBe('deleted');
    expect(await repo.getOwn('A', 'a1')).toBeNull();
  });

  it('delete упражнения, используемого в шаблоне → in_use (FK 23503)', async () => {
    await repo.create({ id: 'a1', trainerId: 'A', name: 'Присед', category: 'Ноги', restSec: 90 });
    await db.insert(workoutTemplates).values({ id: 't1', trainerId: 'A', name: 'Шаблон' });
    await db
      .insert(workoutTemplateExercises)
      .values({ templateId: 't1', position: 0, exerciseId: 'a1', sets: 3, restSec: 90 });
    expect(await repo.delete('A', 'a1')).toBe('in_use');
    // Упражнение осталось на месте (удаление не прошло).
    expect(await repo.getOwn('A', 'a1')).not.toBeNull();
  });

  it('toResponse: isGlobal=true для глобальной, false для личной', async () => {
    const g = await repo.getVisible('A', 'g1');
    await repo.create({ id: 'a1', trainerId: 'A', name: 'Присед', category: 'Ноги', restSec: 90 });
    const own = await repo.getOwn('A', 'a1');
    expect(g?.trainerId).toBeNull();
    expect(own?.trainerId).toBe('A');
  });
});
