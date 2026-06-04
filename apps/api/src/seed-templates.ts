import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { exercises, trainers, workoutTemplateExercises, workoutTemplates } from './db/schema.js';

// Идемпотентный сид БАЗОВЫХ тренировок (шаблонов) для ВСЕХ тренеров. Шаблоны
// принадлежат тренеру (глобальных нет), поэтому создаём набор каждому тренеру.
// Идемпотентность: для тренера пропускаем шаблон, если у него уже есть шаблон с
// таким name. Упражнения берём из ГЛОБАЛЬНОГО каталога по имени (trainer_id IS
// NULL). Запускается в прод-образе как `node dist/seed-templates.js`, dev —
// `tsx src/seed-templates.ts`.

type TemplatePosition = {
  exerciseName: string;
  sets: number;
  reps: number | null;
  timeSec: number | null;
  restSec: number;
};

type BaseTemplate = {
  name: string;
  categoryTag: string;
  shortDescription: string;
  positions: TemplatePosition[];
};

const REST_BASE = 120;
const REST_ISO = 60;
const REST_PLANK = 45;

// Хелперы делают определения позиций компактными и единообразными.
function reps(
  exerciseName: string,
  sets: number,
  repsCount: number,
  restSec: number,
): TemplatePosition {
  return { exerciseName, sets, reps: repsCount, timeSec: null, restSec };
}

function plank(
  exerciseName: string,
  sets: number,
  timeSec: number,
  restSec: number,
): TemplatePosition {
  return { exerciseName, sets, reps: null, timeSec, restSec };
}

const baseTemplates: BaseTemplate[] = [
  {
    name: 'Грудь — сила',
    categoryTag: 'Сила',
    shortDescription: 'Базовая силовая на грудь',
    positions: [
      reps('Жим штанги лёжа', 4, 6, REST_BASE),
      reps('Жим штанги на наклонной скамье', 3, 8, REST_BASE),
      reps('Отжимания на брусьях', 3, 10, REST_BASE),
      reps('Разгибания на блоке', 3, 12, REST_ISO),
    ],
  },
  {
    name: 'Спина — сила',
    categoryTag: 'Сила',
    shortDescription: 'Базовая силовая на спину',
    positions: [
      reps('Подтягивания', 4, 8, REST_BASE),
      reps('Тяга штанги в наклоне', 4, 8, REST_BASE),
      reps('Тяга верхнего блока к груди', 3, 10, REST_BASE),
      reps('Подъём штанги на бицепс', 3, 10, REST_ISO),
    ],
  },
  {
    name: 'Ноги — база',
    categoryTag: 'Сила',
    shortDescription: 'Базовая на ноги',
    positions: [
      reps('Приседания со штангой', 4, 8, REST_BASE),
      reps('Румынская тяга', 3, 10, REST_BASE),
      reps('Жим ногами под углом 45°', 3, 12, REST_BASE),
      reps('Сгибания ног лёжа в тренажёре', 3, 12, REST_ISO),
      reps('Подъёмы на носки стоя', 4, 15, REST_ISO),
    ],
  },
  {
    name: 'Плечи',
    categoryTag: 'Гипертрофия',
    shortDescription: 'Объёмная на плечи',
    positions: [
      reps('Жим штанги стоя (армейский жим)', 4, 8, REST_BASE),
      reps('Махи гантелями в стороны', 3, 15, REST_ISO),
      reps('Тяга к лицу', 3, 15, REST_ISO),
      reps('Шраги со штангой', 3, 12, REST_ISO),
    ],
  },
  {
    name: 'Push — грудь/плечи/трицепс',
    categoryTag: 'Гипертрофия',
    shortDescription: 'Жимовая тренировка',
    positions: [
      reps('Жим штанги лёжа', 4, 8, REST_BASE),
      reps('Жим гантелей сидя', 3, 10, REST_BASE),
      reps('Жим штанги на наклонной скамье', 3, 10, REST_BASE),
      reps('Махи гантелями в стороны', 3, 15, REST_ISO),
      reps('Разгибания на блоке', 3, 12, REST_ISO),
    ],
  },
  {
    name: 'Pull — спина/бицепс',
    categoryTag: 'Гипертрофия',
    shortDescription: 'Тяговая тренировка',
    positions: [
      reps('Подтягивания', 4, 8, REST_BASE),
      reps('Тяга штанги в наклоне', 3, 10, REST_BASE),
      reps('Тяга верхнего блока к груди', 3, 12, REST_BASE),
      reps('Подъём штанги на бицепс', 3, 12, REST_ISO),
      reps('Молотки с гантелями', 3, 12, REST_ISO),
    ],
  },
  {
    name: 'Всё тело',
    categoryTag: 'Сила',
    shortDescription: 'Фулбоди для начинающих',
    positions: [
      reps('Приседания со штангой', 3, 8, REST_BASE),
      reps('Жим штанги лёжа', 3, 8, REST_BASE),
      reps('Тяга штанги в наклоне', 3, 8, REST_BASE),
      reps('Жим штанги стоя (армейский жим)', 3, 10, REST_BASE),
      plank('Планка', 3, 45, REST_PLANK),
    ],
  },
];

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('[seed:templates] DATABASE_URL не задан');
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { max: 1 });
  const db = drizzle(sql);
  try {
    const allTrainers = await db.select({ id: trainers.id }).from(trainers);

    // Карта name → {id, defaultWeightKg} по ГЛОБАЛЬНОМУ каталогу (trainer_id IS NULL).
    const globalExercises = await db
      .select({
        id: exercises.id,
        name: exercises.name,
        defaultWeightKg: exercises.defaultWeightKg,
      })
      .from(exercises)
      .where(isNull(exercises.trainerId));
    const exerciseByName = new Map(
      globalExercises.map((row) => [
        row.name,
        { id: row.id, defaultWeightKg: row.defaultWeightKg },
      ]),
    );

    let createdTemplates = 0;
    let skipped = 0;

    for (const trainer of allTrainers) {
      for (const tpl of baseTemplates) {
        const [already] = await db
          .select({ id: workoutTemplates.id })
          .from(workoutTemplates)
          .where(
            and(eq(workoutTemplates.trainerId, trainer.id), eq(workoutTemplates.name, tpl.name)),
          )
          .limit(1);
        if (already) {
          skipped += 1;
          continue;
        }

        const templateId = randomUUID();
        await db.transaction(async (tx) => {
          await tx.insert(workoutTemplates).values({
            id: templateId,
            trainerId: trainer.id,
            name: tpl.name,
            categoryTag: tpl.categoryTag,
            shortDescription: tpl.shortDescription,
          });

          let position = 0;
          for (const pos of tpl.positions) {
            const ex = exerciseByName.get(pos.exerciseName);
            if (ex === undefined) {
              // Защита: упражнения нет в каталоге — пропускаем позицию.
              continue;
            }
            // Вес — из дефолта упражнения (для силовых на повторы); у планок/времени null.
            const weightKg = pos.reps !== null ? ex.defaultWeightKg : null;
            await tx.insert(workoutTemplateExercises).values({
              templateId,
              position,
              exerciseId: ex.id,
              sets: pos.sets,
              reps: pos.reps,
              weightKg,
              timeSec: pos.timeSec,
              restSec: pos.restSec,
            });
            position += 1;
          }
        });
        createdTemplates += 1;
      }
    }

    console.error(
      `[seed:templates] trainers ${allTrainers.length}, base ${baseTemplates.length}: created ${createdTemplates}, skipped ${skipped}`,
    );
    await sql.end();
    process.exit(0);
  } catch (err) {
    console.error('[seed:templates] failed', err);
    await sql.end({ timeout: 5 }).catch(() => undefined);
    process.exit(1);
  }
}

void main();
