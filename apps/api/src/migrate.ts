import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

// Прод-миграции без drizzle-kit: используем drizzle-orm migrator (prod-зависимость).
// В runtime-образе этот файл лежит как apps/api/dist/migrate.js, а миграции —
// рядом как apps/api/drizzle, т.е. на уровень выше dist → ../drizzle.
const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(here, '../drizzle');

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('[migrate] DATABASE_URL не задан');
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { max: 1 });
  const db = drizzle(sql);
  try {
    console.error(`[migrate] applying migrations from ${migrationsFolder}`);
    await migrate(db, { migrationsFolder });
    console.error('[migrate] done');
    await sql.end();
    process.exit(0);
  } catch (err) {
    console.error('[migrate] failed', err);
    await sql.end({ timeout: 5 }).catch(() => undefined);
    process.exit(1);
  }
}

void main();
