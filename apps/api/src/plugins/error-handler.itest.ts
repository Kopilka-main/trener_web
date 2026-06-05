import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { buildApp } from '../app.js';
import { createDb } from '../db/client.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('error-handler capture (integration)', () => {
  const { db, sql: pg } = createDb(url!);
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    await db.execute(sql`DELETE FROM error_logs`);
    app = await buildApp({ db, cookieSecret: 'x'.repeat(40), isProd: false });
    app.get('/__boom', () => {
      throw new Error('kaboom');
    });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await pg.end();
  });

  it('5xx пишется в error_logs с source=api', async () => {
    const res = await app.inject({ method: 'GET', url: '/__boom' });
    expect(res.statusCode).toBe(500);
    await new Promise((r) => setTimeout(r, 100));
    const rows = await db.execute(
      sql`SELECT source, status_code, message FROM error_logs WHERE source = 'api'`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]?.status_code).toBe(500);
    expect(rows[0]?.message).toBe('kaboom');
  });
});
