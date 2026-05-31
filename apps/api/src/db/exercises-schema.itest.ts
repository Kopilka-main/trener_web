import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from './client.js';
import { trainers, exercises } from './schema.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('exercises schema (integration)', () => {
  const { db, sql: pg } = createDb(url!);

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM exercises`);
    await db.execute(sql`DELETE FROM trainers`);
  });
  afterAll(async () => {
    await pg.end();
  });

  it('хранит глобальную (trainerId null) и личную записи; выборка показывает обе', async () => {
    await db.insert(trainers).values({
      id: 'tr1',
      email: 't@b.co',
      passwordHash: 'h',
      firstName: 'Тр',
      lastName: 'Ен',
    });
    await db.insert(exercises).values({
      id: 'ex-global',
      trainerId: null,
      name: 'Приседания',
      category: 'Ноги',
    });
    await db.insert(exercises).values({
      id: 'ex-own',
      trainerId: 'tr1',
      name: 'Жим лёжа',
      category: 'Грудь',
      defaultReps: 10,
      defaultWeightKg: 60.5,
    });

    const rows = await db.select().from(exercises);
    expect(rows).toHaveLength(2);

    const global = rows.find((r) => r.id === 'ex-global');
    const own = rows.find((r) => r.id === 'ex-own');
    expect(global?.trainerId).toBeNull();
    expect(global?.restSec).toBe(90); // default
    expect(own?.trainerId).toBe('tr1');
    expect(own?.defaultWeightKg).toBe(60.5);
  });
});
