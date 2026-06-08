import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { exercises } from './db/schema.js';

// Идемпотентный сид расширенного ГЛОБАЛЬНОГО каталога (~279 упражнений с медиа),
// импортированного из внешнего датасета и переведённого на русский. Системные
// записи trainer_id IS NULL: видны всем тренерам/клиентам, read-only. Upsert ПО
// ИМЕНИ среди глобальных: новые имена вставляет, существующие обновляет (категория,
// подгруппа, дефолты, медиа). Безопасен при повторном запуске.
// Медиа раздаётся через /api/catalog-media/:file (см. catalog-media.routes.ts);
// файлы лежат в CATALOG_MEDIA_DIR (dev: apps/api/media/catalog).
// Запуск: dev — `tsx src/seed-catalog-300.ts`; прод — `node dist/seed-catalog-300.js`.

type CatalogItem = {
  srcId: number;
  name: string;
  category: string;
  subgroup: string | null;
  equipment: string;
  setKind: 'reps' | 'time';
  image: string;
  video: string | null;
  primaryMuscles: string | null;
  secondaryMuscles: string | null;
};

const DATA_PATH = fileURLToPath(new URL('./data/catalog-300.json', import.meta.url));
const MEDIA_BASE = '/api/catalog-media';

function loadCatalog(): CatalogItem[] {
  const raw = readFileSync(DATA_PATH, 'utf-8');
  return JSON.parse(raw) as CatalogItem[];
}

// Дефолты подхода по формату: повторения → 10 повторов; время → 30 секунд.
function defaults(setKind: CatalogItem['setKind']): {
  defaultReps: number | null;
  defaultTimeSec: number | null;
} {
  return setKind === 'time'
    ? { defaultReps: null, defaultTimeSec: 30 }
    : { defaultReps: 10, defaultTimeSec: null };
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('[seed:catalog-300] DATABASE_URL не задан');
    process.exit(1);
  }
  const catalog = loadCatalog();
  const sql = postgres(databaseUrl, { max: 1 });
  const db = drizzle(sql);

  try {
    const existing = await db
      .select({ id: exercises.id, name: exercises.name })
      .from(exercises)
      .where(isNull(exercises.trainerId));
    const idByName = new Map(existing.map((row) => [row.name, row.id]));

    let inserted = 0;
    let updated = 0;
    await db.transaction(async (tx) => {
      for (const e of catalog) {
        const { defaultReps, defaultTimeSec } = defaults(e.setKind);
        const imageUrl = `${MEDIA_BASE}/${e.image}`;
        const videoUrl = e.video ? `${MEDIA_BASE}/${e.video}` : null;
        const existingId = idByName.get(e.name);
        if (existingId === undefined) {
          await tx.insert(exercises).values({
            id: randomUUID(),
            trainerId: null,
            name: e.name,
            category: e.category,
            subgroup: e.subgroup,
            description: null,
            defaultReps,
            defaultWeightKg: null,
            defaultTimeSec,
            restSec: 90,
            note: null,
            imageUrl,
            videoUrl,
            equipment: e.equipment,
            primaryMuscles: e.primaryMuscles,
            secondaryMuscles: e.secondaryMuscles,
          });
          inserted += 1;
        } else {
          await tx
            .update(exercises)
            .set({
              category: e.category,
              subgroup: e.subgroup,
              defaultReps,
              defaultTimeSec,
              restSec: 90,
              imageUrl,
              videoUrl,
              equipment: e.equipment,
              primaryMuscles: e.primaryMuscles,
              secondaryMuscles: e.secondaryMuscles,
            })
            .where(eq(exercises.id, existingId));
          updated += 1;
        }
      }
    });

    console.error(
      `[seed:catalog-300] upsert done: inserted ${inserted}, updated ${updated} (catalog ${catalog.length})`,
    );
    await sql.end();
    process.exit(0);
  } catch (err) {
    console.error('[seed:catalog-300] failed', err);
    await sql.end({ timeout: 5 }).catch(() => undefined);
    process.exit(1);
  }
}

void main();
