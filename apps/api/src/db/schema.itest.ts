import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from './client.js';
import { trainers } from './schema.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('trainers schema (integration)', () => {
  const { db, sql: pg } = createDb(url!);

  beforeAll(async () => {
    await db.execute(sql`DELETE FROM sessions_auth`);
    await db.execute(sql`DELETE FROM trainers`);
  });
  afterAll(async () => {
    await pg.end();
  });

  it('вставляет и читает тренера', async () => {
    await db.insert(trainers).values({
      id: 't1',
      email: 'a@b.co',
      passwordHash: 'x',
      firstName: 'Иван',
      lastName: 'Тренеров',
    });
    const rows = await db.select().from(trainers);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe('a@b.co');
  });
});
