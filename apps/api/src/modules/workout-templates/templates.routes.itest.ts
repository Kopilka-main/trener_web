import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../../db/client.js';
import { exercises } from '../../db/schema.js';
import { buildApp } from '../../app.js';

const url = process.env.DATABASE_URL;

type ExResp = { exercise: { id: string } };
type TmplResp = {
  template: {
    id: string;
    name: string;
    categoryTag: string | null;
    exercises: { position: number; exerciseId: string; exerciseName: string; sets: number }[];
  };
};

describe.skipIf(!url)('templates routes (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  let app: Awaited<ReturnType<typeof buildApp>>;
  let sid: string;

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM workout_templates`);
    await db.execute(sql`DELETE FROM exercises`);
    await db.execute(sql`DELETE FROM sessions_auth`);
    await db.execute(sql`DELETE FROM trainers`);
    // глобальная (видна всем)
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

  it('CRUD: создать упражнение → шаблон → get резолвит → patch → delete', async () => {
    // личное упражнение
    const exRes = await app.inject({
      method: 'POST',
      url: '/api/exercises',
      cookies: { sid },
      payload: { name: 'Присед', category: 'Ноги', restSec: 90 },
    });
    const exId = exRes.json<ExResp>().exercise.id;

    const created = await app.inject({
      method: 'POST',
      url: '/api/workout-templates',
      cookies: { sid },
      payload: {
        name: 'День ног',
        categoryTag: 'legs',
        exercises: [
          { exerciseId: 'g1', sets: 3, reps: 10, restSec: 90 },
          { exerciseId: exId, sets: 4, reps: 8, restSec: 120 },
        ],
      },
    });
    expect(created.statusCode).toBe(201);
    const tmpl = created.json<TmplResp>().template;
    expect(tmpl.exercises).toHaveLength(2);
    expect(tmpl.exercises[0]?.exerciseName).toBe('Жим лёжа');
    const id = tmpl.id;

    const list = await app.inject({
      method: 'GET',
      url: '/api/workout-templates',
      cookies: { sid },
    });
    expect(list.json<{ templates: unknown[] }>().templates).toHaveLength(1);

    const got = await app.inject({
      method: 'GET',
      url: `/api/workout-templates/${id}`,
      cookies: { sid },
    });
    expect(got.statusCode).toBe(200);
    expect(got.json<TmplResp>().template.exercises[1]?.exerciseName).toBe('Присед');

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/workout-templates/${id}`,
      cookies: { sid },
      payload: { name: 'Ноги v2', exercises: [{ exerciseId: 'g1', sets: 5, restSec: 60 }] },
    });
    const pt = patched.json<TmplResp>().template;
    expect(pt.name).toBe('Ноги v2');
    expect(pt.exercises).toHaveLength(1);
    expect(pt.exercises[0]?.sets).toBe(5);

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/workout-templates/${id}`,
      cookies: { sid },
    });
    expect(del.statusCode).toBe(200);
    const after = await app.inject({
      method: 'GET',
      url: `/api/workout-templates/${id}`,
      cookies: { sid },
    });
    expect(after.statusCode).toBe(404);
  });

  it('создание с невидимым упражнением → 400 UNKNOWN_EXERCISE', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/workout-templates',
      cookies: { sid },
      payload: { name: 'X', exercises: [{ exerciseId: 'nope', sets: 1, restSec: 90 }] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ code: string }>().code).toBe('UNKNOWN_EXERCISE');
  });

  it('создание без auth → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/workout-templates',
      payload: { name: 'X', exercises: [{ exerciseId: 'g1', sets: 1, restSec: 90 }] },
    });
    expect(res.statusCode).toBe(401);
  });
});
