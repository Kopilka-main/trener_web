import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql, eq } from 'drizzle-orm';
import { createDb } from './client.js';
import { trainers, exercises, workoutTemplates, workoutTemplateExercises } from './schema.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('workout_templates schema (integration)', () => {
  const { db, sql: pg } = createDb(url!);

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM workout_template_exercises`);
    await db.execute(sql`DELETE FROM workout_templates`);
    await db.execute(sql`DELETE FROM exercises`);
    await db.execute(sql`DELETE FROM trainers`);
  });
  afterAll(async () => {
    await pg.end();
  });

  it('хранит шаблон с позицией упражнения; выборка резолвит связь', async () => {
    await db.insert(trainers).values({
      id: 'tr1',
      email: 't@b.co',
      passwordHash: 'h',
      firstName: 'Тр',
      lastName: 'Ен',
    });
    await db.insert(exercises).values({
      id: 'ex1',
      trainerId: 'tr1',
      name: 'Жим лёжа',
      category: 'Грудь',
    });
    await db.insert(workoutTemplates).values({
      id: 'tpl1',
      trainerId: 'tr1',
      name: 'День груди',
      categoryTag: 'push',
    });
    await db.insert(workoutTemplateExercises).values({
      templateId: 'tpl1',
      position: 0,
      exerciseId: 'ex1',
      sets: 4,
      reps: 10,
      weightKg: 60.5,
    });

    const tpls = await db.select().from(workoutTemplates);
    expect(tpls).toHaveLength(1);
    expect(tpls[0]?.trainerId).toBe('tr1');
    expect(tpls[0]?.categoryTag).toBe('push');

    const items = await db
      .select()
      .from(workoutTemplateExercises)
      .where(eq(workoutTemplateExercises.templateId, 'tpl1'));
    expect(items).toHaveLength(1);
    expect(items[0]?.position).toBe(0);
    expect(items[0]?.exerciseId).toBe('ex1');
    expect(items[0]?.sets).toBe(4);
    expect(items[0]?.reps).toBe(10);
    expect(items[0]?.weightKg).toBe(60.5);
    expect(items[0]?.restSec).toBe(90); // default
  });

  it('каскад: удаление шаблона удаляет его позиции', async () => {
    await db.insert(trainers).values({
      id: 'tr1',
      email: 't@b.co',
      passwordHash: 'h',
      firstName: 'Тр',
      lastName: 'Ен',
    });
    await db.insert(exercises).values({
      id: 'ex1',
      trainerId: 'tr1',
      name: 'Присед',
      category: 'Ноги',
    });
    await db.insert(workoutTemplates).values({
      id: 'tpl1',
      trainerId: 'tr1',
      name: 'День ног',
    });
    await db.insert(workoutTemplateExercises).values({
      templateId: 'tpl1',
      position: 0,
      exerciseId: 'ex1',
      sets: 3,
    });

    await db.delete(workoutTemplates).where(eq(workoutTemplates.id, 'tpl1'));

    const items = await db.select().from(workoutTemplateExercises);
    expect(items).toHaveLength(0);
  });
});
