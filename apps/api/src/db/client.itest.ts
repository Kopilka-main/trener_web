import { describe, it, expect, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from './client.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('createDb (integration)', () => {
  const { db, sql: pg } = createDb(url!);

  afterAll(async () => {
    await pg.end();
  });

  it('выполняет ping-запрос к Postgres', async () => {
    const result = await db.execute(sql`SELECT 1 AS ping`);
    expect(result[0]).toMatchObject({ ping: 1 });
  });
});
