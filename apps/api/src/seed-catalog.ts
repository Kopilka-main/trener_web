import { randomUUID } from 'node:crypto';
import { count, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { exercises } from './db/schema.js';

// Идемпотентный сид ГЛОБАЛЬНОГО каталога упражнений: системные записи
// trainer_id IS NULL, видны всем тренерам, read-only (это уже обеспечено в
// exercises.repo). Скрипт ТОЛЬКО вставляет набор — один раз. Запускается в
// прод-образе как `node dist/seed-catalog.js`, dev — `tsx src/seed-catalog.ts`.

type CatalogExercise = {
  name: string;
  category: string;
  description?: string;
  defaultReps?: number;
  defaultWeightKg?: number;
  defaultTimeSec?: number;
  restSec: number;
};

// Базовый каталог (~24 упражнения). Названия/категории взяты по образцу MVP
// (server/src/seed.ts), категории нормализованы под 8 групп.
const catalog: CatalogExercise[] = [
  // Грудь
  {
    name: 'Жим штанги лёжа',
    category: 'Грудь',
    description: 'Базовое упражнение для грудных мышц, трицепса и передней дельты.',
    defaultReps: 8,
    defaultWeightKg: 60,
    restSec: 120,
  },
  {
    name: 'Жим гантелей на наклонной скамье',
    category: 'Грудь',
    description: 'Акцент на верхнюю часть грудных мышц.',
    defaultReps: 10,
    defaultWeightKg: 22,
    restSec: 90,
  },
  {
    name: 'Отжимания на брусьях',
    category: 'Грудь',
    description: 'Базовое упражнение собственным весом для низа груди и трицепса.',
    defaultReps: 10,
    restSec: 90,
  },
  // Спина
  {
    name: 'Подтягивания',
    category: 'Спина',
    description: 'Базовое упражнение собственным весом для широчайших и бицепса.',
    defaultReps: 8,
    restSec: 120,
  },
  {
    name: 'Тяга штанги в наклоне',
    category: 'Спина',
    description: 'База на среднюю часть спины и широчайшие.',
    defaultReps: 8,
    defaultWeightKg: 60,
    restSec: 120,
  },
  {
    name: 'Тяга верхнего блока',
    category: 'Спина',
    description: 'Тяга к груди широким хватом, акцент на широчайшие.',
    defaultReps: 10,
    defaultWeightKg: 50,
    restSec: 90,
  },
  {
    name: 'Тяга горизонтального блока',
    category: 'Спина',
    description: 'Тяга сидя на блоке для средней части спины.',
    defaultReps: 10,
    defaultWeightKg: 55,
    restSec: 90,
  },
  // Ноги
  {
    name: 'Приседания со штангой',
    category: 'Ноги',
    description: 'Базовое упражнение для квадрицепса, ягодиц и кора.',
    defaultReps: 8,
    defaultWeightKg: 70,
    restSec: 120,
  },
  {
    name: 'Жим ногами под углом 45°',
    category: 'Ноги',
    description: 'Базовое упражнение для квадрицепса и ягодиц на тренажёре под углом.',
    defaultReps: 10,
    defaultWeightKg: 80,
    restSec: 90,
  },
  {
    name: 'Румынская тяга',
    category: 'Ноги',
    description: 'Базовое упражнение для бицепса бедра и ягодиц.',
    defaultReps: 12,
    defaultWeightKg: 60,
    restSec: 120,
  },
  {
    name: 'Выпады с гантелями',
    category: 'Ноги',
    description: 'Квадрицепс и ягодицы, развитие баланса и стабилизации.',
    defaultReps: 12,
    defaultWeightKg: 16,
    restSec: 90,
  },
  {
    name: 'Разгибания ног в тренажёре',
    category: 'Ноги',
    description: 'Изоляция квадрицепса.',
    defaultReps: 15,
    defaultWeightKg: 35,
    restSec: 90,
  },
  {
    name: 'Подъёмы на носки сидя',
    category: 'Ноги',
    description: 'Изоляция икроножных мышц.',
    defaultReps: 20,
    defaultWeightKg: 40,
    restSec: 60,
  },
  // Плечи
  {
    name: 'Жим гантелей сидя',
    category: 'Плечи',
    description: 'Жим над головой для дельтовидных мышц.',
    defaultReps: 10,
    defaultWeightKg: 22,
    restSec: 90,
  },
  {
    name: 'Махи гантелями в стороны',
    category: 'Плечи',
    description: 'Изоляция средней дельты.',
    defaultReps: 15,
    defaultWeightKg: 6,
    restSec: 60,
  },
  {
    name: 'Тяга к лицу',
    category: 'Плечи',
    description: 'Изоляция задней дельты и трапеций.',
    defaultReps: 12,
    defaultWeightKg: 20,
    restSec: 60,
  },
  {
    name: 'Шраги с гантелями',
    category: 'Плечи',
    description: 'Изоляция трапеций.',
    defaultReps: 12,
    defaultWeightKg: 24,
    restSec: 60,
  },
  // Руки
  {
    name: 'Подъём штанги на бицепс',
    category: 'Руки',
    description: 'Базовое упражнение для бицепса.',
    defaultReps: 10,
    defaultWeightKg: 25,
    restSec: 60,
  },
  {
    name: 'Молотки на бицепс',
    category: 'Руки',
    description: 'Гантели нейтральным хватом, бицепс и брахиалис.',
    defaultReps: 12,
    defaultWeightKg: 14,
    restSec: 60,
  },
  {
    name: 'Разгибания на блоке',
    category: 'Руки',
    description: 'Изоляция трицепса.',
    defaultReps: 12,
    defaultWeightKg: 25,
    restSec: 60,
  },
  // Пресс/Кор
  {
    name: 'Планка',
    category: 'Пресс/Кор',
    description: 'Изометрическое удержание корпуса, прямая и поперечная мышцы живота.',
    defaultTimeSec: 60,
    restSec: 60,
  },
  {
    name: 'Скручивания на пресс',
    category: 'Пресс/Кор',
    description: 'Изоляция прямой мышцы живота.',
    defaultReps: 20,
    restSec: 45,
  },
  // Кардио
  {
    name: 'Бег на дорожке',
    category: 'Кардио',
    description: 'Аэробная нагрузка средней интенсивности.',
    defaultTimeSec: 1200,
    restSec: 0,
  },
  // Растяжка
  {
    name: 'Растяжка квадрицепса',
    category: 'Растяжка',
    description: 'Стоя, нога подтянута к ягодице; растяжение передней поверхности бедра.',
    defaultTimeSec: 30,
    restSec: 0,
  },
];

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('[seed:catalog] DATABASE_URL не задан');
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { max: 1 });
  const db = drizzle(sql);
  try {
    // Идемпотентность: если глобальные записи уже есть — ничего не делаем.
    const [existing] = await db
      .select({ n: count() })
      .from(exercises)
      .where(isNull(exercises.trainerId));
    if (existing && existing.n > 0) {
      console.error(`[seed:catalog] catalog already seeded (${existing.n}), skip`);
      await sql.end();
      process.exit(0);
    }

    const rows = catalog.map((e) => ({
      id: randomUUID(),
      trainerId: null,
      name: e.name,
      category: e.category,
      description: e.description ?? null,
      defaultReps: e.defaultReps ?? null,
      defaultWeightKg: e.defaultWeightKg ?? null,
      defaultTimeSec: e.defaultTimeSec ?? null,
      restSec: e.restSec,
      note: null,
    }));
    await db.insert(exercises).values(rows);
    console.error(`[seed:catalog] inserted ${rows.length} global exercises`);
    await sql.end();
    process.exit(0);
  } catch (err) {
    console.error('[seed:catalog] failed', err);
    await sql.end({ timeout: 5 }).catch(() => undefined);
    process.exit(1);
  }
}

void main();
