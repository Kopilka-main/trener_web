import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { exercises, workoutTemplates, workoutTemplateExercises } from '../../db/schema.js';
import { buildApp } from '../../app.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('exercises routes (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  let app: Awaited<ReturnType<typeof buildApp>>;
  let sid: string;

  beforeEach(async () => {
    // Снимаем зависимые строки от других itest-файлов: client_workout_exercises
    // ссылается на exercises (без cascade), поэтому сначала чистим client_workouts
    // (каскад удалит упражнения тренировок), иначе DELETE FROM exercises упрётся в FK.
    await db.execute(sql`DELETE FROM client_workouts`);
    await db.execute(sql`DELETE FROM workout_template_exercises`);
    await db.execute(sql`DELETE FROM workout_templates`);
    await db.execute(sql`DELETE FROM exercises`);
    await db.execute(sql`DELETE FROM sessions_auth`);
    await db.execute(sql`DELETE FROM trainers`);
    // Глобальная системная запись (видна всем).
    await db
      .insert(exercises)
      .values({ id: 'g1', trainerId: null, name: 'Жим лёжа', category: 'Грудь', restSec: 90 });
    app = await buildApp({ db, cookieSecret: 'x'.repeat(40), isProd: false });
    const reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'a@b.co', password: 'longenough1', firstName: 'Тр', lastName: 'Ен' },
    });
    sid = reg.cookies.find((c) => c.name === 'sid')!.value;
  });
  afterAll(async () => {
    await pg.end();
  });

  it('CRUD личного: create → list(incl. global) → get → patch → delete', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/exercises',
      cookies: { sid },
      payload: { name: 'Присед', category: 'Ноги', defaultReps: 10, restSec: 120 },
    });
    expect(created.statusCode).toBe(201);
    const ex = created.json<{ exercise: { id: string; isGlobal: boolean } }>().exercise;
    expect(ex.isGlobal).toBe(false);
    const id = ex.id;

    const list = await app.inject({ method: 'GET', url: '/api/exercises', cookies: { sid } });
    const items = list.json<{ exercises: { id: string; isGlobal: boolean }[] }>().exercises;
    // Список включает глобальную «Жим лёжа» и личную «Присед».
    expect(items).toHaveLength(2);
    expect(items.find((e) => e.id === 'g1')?.isGlobal).toBe(true);
    expect(items.find((e) => e.id === id)?.isGlobal).toBe(false);

    const got = await app.inject({ method: 'GET', url: `/api/exercises/${id}`, cookies: { sid } });
    expect(got.statusCode).toBe(200);
    expect(got.json<{ exercise: { name: string } }>().exercise.name).toBe('Присед');

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/exercises/${id}`,
      cookies: { sid },
      payload: { name: 'Присед со штангой', restSec: 90 },
    });
    expect(patched.json<{ exercise: { name: string } }>().exercise.name).toBe('Присед со штангой');

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/exercises/${id}`,
      cookies: { sid },
    });
    expect(del.statusCode).toBe(200);

    const after = await app.inject({
      method: 'GET',
      url: `/api/exercises/${id}`,
      cookies: { sid },
    });
    expect(after.statusCode).toBe(404);
  });

  it('глобальную нельзя править/удалять (404)', async () => {
    const patch = await app.inject({
      method: 'PATCH',
      url: '/api/exercises/g1',
      cookies: { sid },
      payload: { name: 'Hacked' },
    });
    expect(patch.statusCode).toBe(404);
    const del = await app.inject({
      method: 'DELETE',
      url: '/api/exercises/g1',
      cookies: { sid },
    });
    expect(del.statusCode).toBe(404);
    // Но читать глобальную можно.
    const got = await app.inject({ method: 'GET', url: '/api/exercises/g1', cookies: { sid } });
    expect(got.statusCode).toBe(200);
    expect(got.json<{ exercise: { isGlobal: boolean } }>().exercise.isGlobal).toBe(true);
  });

  it('удаление упражнения, используемого в шаблоне → 409 EXERCISE_IN_USE', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/exercises',
      cookies: { sid },
      payload: { name: 'Присед', category: 'Ноги', restSec: 90 },
    });
    const id = created.json<{ exercise: { id: string } }>().exercise.id;
    // Создаём шаблон тренера и привязываем к нему упражнение.
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { sid } });
    const trainerId = me.json<{ trainer: { id: string } }>().trainer.id;
    await db.insert(workoutTemplates).values({ id: 't1', trainerId, name: 'Шаблон' });
    await db
      .insert(workoutTemplateExercises)
      .values({ templateId: 't1', position: 0, exerciseId: id, sets: 3, restSec: 90 });

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/exercises/${id}`,
      cookies: { sid },
    });
    expect(del.statusCode).toBe(409);
    expect(del.json<{ code: string }>().code).toBe('EXERCISE_IN_USE');
  });

  it('создание без auth → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/exercises',
      payload: { name: 'X', category: 'Y' },
    });
    expect(res.statusCode).toBe(401);
  });
});
