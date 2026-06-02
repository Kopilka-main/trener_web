import { randomUUID } from 'node:crypto';
import { eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { exercises } from './db/schema.js';

// Идемпотентный сид ГЛОБАЛЬНОГО каталога упражнений: системные записи
// trainer_id IS NULL, видны всем тренерам, read-only (это уже обеспечено в
// exercises.repo). Скрипт делает upsert ПО ИМЕНИ среди глобальных: новые имена
// вставляет, существующие — обновляет (в т.ч. проставляет subgroup). Безопасен
// при повторном запуске. Запускается в прод-образе как `node dist/seed-catalog.js`,
// dev — `tsx src/seed-catalog.ts`.

type CatalogExercise = {
  name: string;
  category: string;
  subgroup?: string;
  description?: string;
  defaultReps?: number;
  defaultWeightKg?: number;
  defaultTimeSec?: number;
  restSec: number;
};

// Расширенный каталог по подгруппам мышц. Строки subgroup ДОЛЖНЫ дословно
// совпадать с таксономией apps/web/src/lib/muscleGroups.ts.
const catalog: CatalogExercise[] = [
  // ── Грудь · Верх ──────────────────────────────────────────────────────────
  {
    name: 'Жим штанги на наклонной скамье',
    category: 'Грудь',
    subgroup: 'Верх',
    description: 'База на верх грудных под положительным углом.',
    defaultReps: 8,
    defaultWeightKg: 50,
    restSec: 120,
  },
  {
    name: 'Жим гантелей на наклонной скамье',
    category: 'Грудь',
    subgroup: 'Верх',
    description: 'Акцент на верхнюю часть грудных мышц.',
    defaultReps: 10,
    defaultWeightKg: 22,
    restSec: 90,
  },
  {
    name: 'Сведение рук в кроссовере снизу-вверх',
    category: 'Грудь',
    subgroup: 'Верх',
    description: 'Изоляция верха груди в кроссовере по нижним блокам.',
    defaultReps: 15,
    defaultWeightKg: 12,
    restSec: 60,
  },
  // ── Грудь · Середина ──────────────────────────────────────────────────────
  {
    name: 'Жим штанги лёжа',
    category: 'Грудь',
    subgroup: 'Середина',
    description: 'Базовое упражнение для грудных мышц, трицепса и передней дельты.',
    defaultReps: 6,
    defaultWeightKg: 60,
    restSec: 120,
  },
  {
    name: 'Жим гантелей лёжа',
    category: 'Грудь',
    subgroup: 'Середина',
    description: 'База на грудные с большей амплитудой и стабилизацией.',
    defaultReps: 10,
    defaultWeightKg: 26,
    restSec: 90,
  },
  {
    name: 'Сведение рук в тренажёре „бабочка“',
    category: 'Грудь',
    subgroup: 'Середина',
    description: 'Изоляция середины грудных в тренажёре.',
    defaultReps: 15,
    defaultWeightKg: 35,
    restSec: 60,
  },
  // ── Грудь · Низ ───────────────────────────────────────────────────────────
  {
    name: 'Отжимания на брусьях',
    category: 'Грудь',
    subgroup: 'Низ',
    description: 'Базовое упражнение собственным весом для низа груди и трицепса.',
    defaultReps: 10,
    restSec: 90,
  },
  {
    name: 'Жим штанги лёжа головой вниз',
    category: 'Грудь',
    subgroup: 'Низ',
    description: 'База на низ грудных под отрицательным углом.',
    defaultReps: 8,
    defaultWeightKg: 55,
    restSec: 120,
  },
  {
    name: 'Сведение в кроссовере сверху-вниз',
    category: 'Грудь',
    subgroup: 'Низ',
    description: 'Изоляция низа груди в кроссовере по верхним блокам.',
    defaultReps: 15,
    defaultWeightKg: 14,
    restSec: 60,
  },
  // ── Спина · Широчайшие ────────────────────────────────────────────────────
  {
    name: 'Подтягивания',
    category: 'Спина',
    subgroup: 'Широчайшие',
    description: 'Базовое упражнение собственным весом для широчайших и бицепса.',
    defaultReps: 8,
    restSec: 90,
  },
  {
    name: 'Тяга верхнего блока к груди',
    category: 'Спина',
    subgroup: 'Широчайшие',
    description: 'Тяга к груди широким хватом, акцент на широчайшие.',
    defaultReps: 10,
    defaultWeightKg: 50,
    restSec: 90,
  },
  {
    name: 'Тяга штанги в наклоне',
    category: 'Спина',
    subgroup: 'Широчайшие',
    description: 'База на среднюю часть спины и широчайшие.',
    defaultReps: 8,
    defaultWeightKg: 60,
    restSec: 120,
  },
  {
    name: 'Тяга гантели в наклоне одной рукой',
    category: 'Спина',
    subgroup: 'Широчайшие',
    description: 'Односторонняя тяга гантели с упором, акцент на широчайшие.',
    defaultReps: 10,
    defaultWeightKg: 28,
    restSec: 90,
  },
  {
    name: 'Тяга горизонтального блока',
    category: 'Спина',
    subgroup: 'Широчайшие',
    description: 'Тяга сидя на блоке для средней части спины.',
    defaultReps: 10,
    defaultWeightKg: 55,
    restSec: 90,
  },
  {
    name: 'Пуловер с гантелью',
    category: 'Спина',
    subgroup: 'Широчайшие',
    description: 'Изоляция широчайших и зубчатых через растяжение.',
    defaultReps: 12,
    defaultWeightKg: 20,
    restSec: 60,
  },
  // ── Спина · Трапеции/верх ─────────────────────────────────────────────────
  {
    name: 'Тяга штанги к подбородку',
    category: 'Спина',
    subgroup: 'Трапеции/верх',
    description: 'Тяга к подбородку для верха трапеций и средней дельты.',
    defaultReps: 12,
    defaultWeightKg: 30,
    restSec: 60,
  },
  {
    name: 'Шраги со штангой',
    category: 'Спина',
    subgroup: 'Трапеции/верх',
    description: 'Изоляция трапеций со штангой.',
    defaultReps: 12,
    defaultWeightKg: 70,
    restSec: 60,
  },
  {
    name: 'Шраги с гантелями',
    category: 'Спина',
    subgroup: 'Трапеции/верх',
    description: 'Изоляция трапеций с гантелями.',
    defaultReps: 12,
    defaultWeightKg: 28,
    restSec: 60,
  },
  // ── Спина · Поясница/низ ──────────────────────────────────────────────────
  {
    name: 'Становая тяга',
    category: 'Спина',
    subgroup: 'Поясница/низ',
    description: 'Базовое упражнение для всей задней цепи и разгибателей спины.',
    defaultReps: 6,
    defaultWeightKg: 90,
    restSec: 120,
  },
  {
    name: 'Гиперэкстензия',
    category: 'Спина',
    subgroup: 'Поясница/низ',
    description: 'Изоляция разгибателей спины и ягодиц.',
    defaultReps: 15,
    restSec: 60,
  },
  // ── Ноги · Квадрицепс ─────────────────────────────────────────────────────
  {
    name: 'Приседания со штангой',
    category: 'Ноги',
    subgroup: 'Квадрицепс',
    description: 'Базовое упражнение для квадрицепса, ягодиц и кора.',
    defaultReps: 8,
    defaultWeightKg: 70,
    restSec: 120,
  },
  {
    name: 'Жим ногами под углом 45°',
    category: 'Ноги',
    subgroup: 'Квадрицепс',
    description: 'Базовое упражнение для квадрицепса и ягодиц на тренажёре под углом.',
    defaultReps: 10,
    defaultWeightKg: 120,
    restSec: 90,
  },
  {
    name: 'Разгибания ног в тренажёре',
    category: 'Ноги',
    subgroup: 'Квадрицепс',
    description: 'Изоляция квадрицепса.',
    defaultReps: 15,
    defaultWeightKg: 35,
    restSec: 60,
  },
  {
    name: 'Выпады с гантелями',
    category: 'Ноги',
    subgroup: 'Квадрицепс',
    description: 'Квадрицепс и ягодицы, развитие баланса и стабилизации.',
    defaultReps: 12,
    defaultWeightKg: 16,
    restSec: 90,
  },
  {
    name: 'Гакк-приседания',
    category: 'Ноги',
    subgroup: 'Квадрицепс',
    description: 'Приседания в тренажёре с акцентом на квадрицепс.',
    defaultReps: 10,
    defaultWeightKg: 80,
    restSec: 90,
  },
  // ── Ноги · Бицепс бедра ───────────────────────────────────────────────────
  {
    name: 'Румынская тяга',
    category: 'Ноги',
    subgroup: 'Бицепс бедра',
    description: 'Базовое упражнение для бицепса бедра и ягодиц.',
    defaultReps: 10,
    defaultWeightKg: 60,
    restSec: 120,
  },
  {
    name: 'Сгибания ног лёжа в тренажёре',
    category: 'Ноги',
    subgroup: 'Бицепс бедра',
    description: 'Изоляция бицепса бедра.',
    defaultReps: 12,
    defaultWeightKg: 30,
    restSec: 60,
  },
  {
    name: 'Становая тяга на прямых ногах',
    category: 'Ноги',
    subgroup: 'Бицепс бедра',
    description: 'Тяга на прямых ногах с акцентом на растяжение бицепса бедра.',
    defaultReps: 10,
    defaultWeightKg: 55,
    restSec: 120,
  },
  // ── Ноги · Ягодицы ────────────────────────────────────────────────────────
  {
    name: 'Ягодичный мост со штангой',
    category: 'Ноги',
    subgroup: 'Ягодицы',
    description: 'Базовое упражнение для ягодичных мышц.',
    defaultReps: 10,
    defaultWeightKg: 60,
    restSec: 90,
  },
  {
    name: 'Болгарские выпады',
    category: 'Ноги',
    subgroup: 'Ягодицы',
    description: 'Сплит-приседания с задней ногой на опоре, акцент на ягодицы.',
    defaultReps: 12,
    defaultWeightKg: 16,
    restSec: 90,
  },
  {
    name: 'Отведение ноги в кроссовере',
    category: 'Ноги',
    subgroup: 'Ягодицы',
    description: 'Изоляция ягодичных через отведение ноги на нижнем блоке.',
    defaultReps: 15,
    defaultWeightKg: 12,
    restSec: 60,
  },
  // ── Ноги · Икры ───────────────────────────────────────────────────────────
  {
    name: 'Подъёмы на носки стоя',
    category: 'Ноги',
    subgroup: 'Икры',
    description: 'Изоляция икроножных мышц стоя.',
    defaultReps: 15,
    defaultWeightKg: 60,
    restSec: 60,
  },
  {
    name: 'Подъёмы на носки сидя',
    category: 'Ноги',
    subgroup: 'Икры',
    description: 'Изоляция камбаловидной мышцы сидя.',
    defaultReps: 20,
    defaultWeightKg: 40,
    restSec: 60,
  },
  // ── Плечи · Передняя дельта ───────────────────────────────────────────────
  {
    name: 'Жим штанги стоя (армейский жим)',
    category: 'Плечи',
    subgroup: 'Передняя дельта',
    description: 'Базовый жим над головой для передней дельты.',
    defaultReps: 8,
    defaultWeightKg: 40,
    restSec: 120,
  },
  {
    name: 'Жим гантелей сидя',
    category: 'Плечи',
    subgroup: 'Передняя дельта',
    description: 'Жим над головой для дельтовидных мышц сидя.',
    defaultReps: 10,
    defaultWeightKg: 22,
    restSec: 90,
  },
  {
    name: 'Подъёмы гантелей перед собой',
    category: 'Плечи',
    subgroup: 'Передняя дельта',
    description: 'Изоляция передней дельты.',
    defaultReps: 12,
    defaultWeightKg: 8,
    restSec: 60,
  },
  // ── Плечи · Средняя дельта ────────────────────────────────────────────────
  {
    name: 'Махи гантелями в стороны',
    category: 'Плечи',
    subgroup: 'Средняя дельта',
    description: 'Изоляция средней дельты.',
    defaultReps: 15,
    defaultWeightKg: 6,
    restSec: 60,
  },
  {
    name: 'Жим Арнольда',
    category: 'Плечи',
    subgroup: 'Средняя дельта',
    description: 'Жим гантелей с разворотом, нагрузка на переднюю и среднюю дельту.',
    defaultReps: 10,
    defaultWeightKg: 18,
    restSec: 90,
  },
  {
    name: 'Махи в стороны на блоке',
    category: 'Плечи',
    subgroup: 'Средняя дельта',
    description: 'Изоляция средней дельты на нижнем блоке кроссовера.',
    defaultReps: 15,
    defaultWeightKg: 8,
    restSec: 60,
  },
  // ── Плечи · Задняя дельта ─────────────────────────────────────────────────
  {
    name: 'Тяга к лицу',
    category: 'Плечи',
    subgroup: 'Задняя дельта',
    description: 'Изоляция задней дельты и трапеций на верхнем блоке.',
    defaultReps: 15,
    defaultWeightKg: 20,
    restSec: 60,
  },
  {
    name: 'Махи гантелями в наклоне',
    category: 'Плечи',
    subgroup: 'Задняя дельта',
    description: 'Изоляция задней дельты в наклоне.',
    defaultReps: 15,
    defaultWeightKg: 8,
    restSec: 60,
  },
  {
    name: 'Обратные разведения в тренажёре',
    category: 'Плечи',
    subgroup: 'Задняя дельта',
    description: 'Изоляция задней дельты в тренажёре „бабочка“ обратным хватом.',
    defaultReps: 15,
    defaultWeightKg: 25,
    restSec: 60,
  },
  // ── Руки · Бицепс ─────────────────────────────────────────────────────────
  {
    name: 'Подъём штанги на бицепс',
    category: 'Руки',
    subgroup: 'Бицепс',
    description: 'Базовое упражнение для бицепса со штангой.',
    defaultReps: 10,
    defaultWeightKg: 25,
    restSec: 60,
  },
  {
    name: 'Молотки с гантелями',
    category: 'Руки',
    subgroup: 'Бицепс',
    description: 'Гантели нейтральным хватом, бицепс и брахиалис.',
    defaultReps: 12,
    defaultWeightKg: 14,
    restSec: 60,
  },
  {
    name: 'Сгибания на скамье Скотта',
    category: 'Руки',
    subgroup: 'Бицепс',
    description: 'Изоляция бицепса на скамье Скотта.',
    defaultReps: 12,
    defaultWeightKg: 20,
    restSec: 60,
  },
  {
    name: 'Подъём гантелей на бицепс сидя',
    category: 'Руки',
    subgroup: 'Бицепс',
    description: 'Сгибания гантелей на бицепс сидя с супинацией.',
    defaultReps: 12,
    defaultWeightKg: 14,
    restSec: 60,
  },
  // ── Руки · Трицепс ────────────────────────────────────────────────────────
  {
    name: 'Разгибания на блоке',
    category: 'Руки',
    subgroup: 'Трицепс',
    description: 'Изоляция трицепса на верхнем блоке.',
    defaultReps: 12,
    defaultWeightKg: 25,
    restSec: 60,
  },
  {
    name: 'Французский жим лёжа',
    category: 'Руки',
    subgroup: 'Трицепс',
    description: 'Разгибания со штангой из-за головы лёжа, изоляция трицепса.',
    defaultReps: 12,
    defaultWeightKg: 25,
    restSec: 60,
  },
  {
    name: 'Жим узким хватом',
    category: 'Руки',
    subgroup: 'Трицепс',
    description: 'Базовый жим узким хватом с акцентом на трицепс.',
    defaultReps: 8,
    defaultWeightKg: 45,
    restSec: 120,
  },
  {
    name: 'Разгибание гантели из-за головы',
    category: 'Руки',
    subgroup: 'Трицепс',
    description: 'Изоляция трицепса разгибанием гантели из-за головы.',
    defaultReps: 12,
    defaultWeightKg: 14,
    restSec: 60,
  },
  // ── Руки · Предплечья ─────────────────────────────────────────────────────
  {
    name: 'Сгибания запястий со штангой',
    category: 'Руки',
    subgroup: 'Предплечья',
    description: 'Изоляция сгибателей предплечья.',
    defaultReps: 15,
    defaultWeightKg: 20,
    restSec: 60,
  },
  {
    name: 'Обратные сгибания на бицепс',
    category: 'Руки',
    subgroup: 'Предплечья',
    description: 'Подъём штанги обратным хватом, акцент на предплечья и брахиалис.',
    defaultReps: 12,
    defaultWeightKg: 20,
    restSec: 60,
  },
  // ── Пресс/Кор · Верх ──────────────────────────────────────────────────────
  {
    name: 'Скручивания на пресс',
    category: 'Пресс/Кор',
    subgroup: 'Верх',
    description: 'Изоляция верха прямой мышцы живота.',
    defaultReps: 20,
    restSec: 45,
  },
  {
    name: 'Скручивания на блоке',
    category: 'Пресс/Кор',
    subgroup: 'Верх',
    description: 'Скручивания с отягощением на верхнем блоке.',
    defaultReps: 15,
    defaultWeightKg: 30,
    restSec: 45,
  },
  // ── Пресс/Кор · Низ ───────────────────────────────────────────────────────
  {
    name: 'Подъёмы ног в висе',
    category: 'Пресс/Кор',
    subgroup: 'Низ',
    description: 'Акцент на низ пресса в висе на перекладине.',
    defaultReps: 15,
    restSec: 45,
  },
  {
    name: 'Обратные скручивания',
    category: 'Пресс/Кор',
    subgroup: 'Низ',
    description: 'Подъём таза лёжа, акцент на низ прямой мышцы живота.',
    defaultReps: 20,
    restSec: 45,
  },
  {
    name: 'Планка',
    category: 'Пресс/Кор',
    subgroup: 'Низ',
    description: 'Изометрическое удержание корпуса, прямая и поперечная мышцы живота.',
    defaultTimeSec: 45,
    restSec: 45,
  },
  // ── Пресс/Кор · Косые ─────────────────────────────────────────────────────
  {
    name: 'Русские скручивания',
    category: 'Пресс/Кор',
    subgroup: 'Косые',
    description: 'Повороты корпуса сидя, нагрузка на косые мышцы живота.',
    defaultReps: 20,
    restSec: 45,
  },
  {
    name: 'Боковая планка',
    category: 'Пресс/Кор',
    subgroup: 'Косые',
    description: 'Изометрическое удержание на боку, косые мышцы и стабилизаторы.',
    defaultTimeSec: 45,
    restSec: 45,
  },
  {
    name: 'Наклоны в стороны с гантелью',
    category: 'Пресс/Кор',
    subgroup: 'Косые',
    description: 'Наклоны корпуса с гантелью, изоляция косых мышц.',
    defaultReps: 15,
    defaultWeightKg: 16,
    restSec: 45,
  },
  // ── Кардио (без subgroup) ─────────────────────────────────────────────────
  {
    name: 'Бег на дорожке',
    category: 'Кардио',
    description: 'Аэробная нагрузка средней интенсивности.',
    defaultTimeSec: 1200,
    restSec: 0,
  },
  {
    name: 'Велотренажёр',
    category: 'Кардио',
    description: 'Аэробная нагрузка на велотренажёре.',
    defaultTimeSec: 1200,
    restSec: 0,
  },
  {
    name: 'Гребной тренажёр',
    category: 'Кардио',
    description: 'Аэробно-силовая нагрузка на гребном тренажёре.',
    defaultTimeSec: 600,
    restSec: 0,
  },
  {
    name: 'Скакалка',
    category: 'Кардио',
    description: 'Интенсивная аэробная нагрузка со скакалкой.',
    defaultTimeSec: 600,
    restSec: 0,
  },
  // ── Растяжка (без subgroup) ───────────────────────────────────────────────
  {
    name: 'Растяжка квадрицепса',
    category: 'Растяжка',
    description: 'Стоя, нога подтянута к ягодице; растяжение передней поверхности бедра.',
    defaultTimeSec: 30,
    restSec: 0,
  },
  {
    name: 'Растяжка бицепса бедра',
    category: 'Растяжка',
    description: 'Наклон к прямой ноге; растяжение задней поверхности бедра.',
    defaultTimeSec: 30,
    restSec: 0,
  },
  {
    name: 'Растяжка грудных',
    category: 'Растяжка',
    description: 'Растяжение грудных мышц у опоры/в дверном проёме.',
    defaultTimeSec: 30,
    restSec: 0,
  },
  {
    name: 'Растяжка широчайших',
    category: 'Растяжка',
    description: 'Растяжение широчайших с захватом за опору.',
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
    // Upsert по имени среди глобальных (trainer_id IS NULL): существующие имена
    // обновляем (в т.ч. проставляем subgroup), отсутствующие — вставляем.
    const existing = await db
      .select({ id: exercises.id, name: exercises.name })
      .from(exercises)
      .where(isNull(exercises.trainerId));
    const idByName = new Map(existing.map((row) => [row.name, row.id]));

    let inserted = 0;
    let updated = 0;
    await db.transaction(async (tx) => {
      for (const e of catalog) {
        const existingId = idByName.get(e.name);
        if (existingId === undefined) {
          await tx.insert(exercises).values({
            id: randomUUID(),
            trainerId: null,
            name: e.name,
            category: e.category,
            subgroup: e.subgroup ?? null,
            description: e.description ?? null,
            defaultReps: e.defaultReps ?? null,
            defaultWeightKg: e.defaultWeightKg ?? null,
            defaultTimeSec: e.defaultTimeSec ?? null,
            restSec: e.restSec,
            note: null,
          });
          inserted += 1;
        } else {
          await tx
            .update(exercises)
            .set({
              category: e.category,
              subgroup: e.subgroup ?? null,
              description: e.description ?? null,
              defaultReps: e.defaultReps ?? null,
              defaultWeightKg: e.defaultWeightKg ?? null,
              defaultTimeSec: e.defaultTimeSec ?? null,
              restSec: e.restSec,
            })
            .where(eq(exercises.id, existingId));
          updated += 1;
        }
      }
    });

    console.error(
      `[seed:catalog] upsert done: inserted ${inserted}, updated ${updated} (catalog ${catalog.length})`,
    );
    await sql.end();
    process.exit(0);
  } catch (err) {
    console.error('[seed:catalog] failed', err);
    await sql.end({ timeout: 5 }).catch(() => undefined);
    process.exit(1);
  }
}

void main();
