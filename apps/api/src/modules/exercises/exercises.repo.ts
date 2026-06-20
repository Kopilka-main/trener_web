import { and, asc, eq, isNull, or } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { exercises } from '../../db/schema.js';
import type { ExerciseResponse } from '@trener/shared';

export type ExerciseRow = {
  id: string;
  trainerId: string | null;
  name: string;
  category: string;
  subgroup: string | null;
  description: string | null;
  defaultReps: number | null;
  defaultWeightKg: number | null;
  defaultTimeSec: number | null;
  restSec: number;
  note: string | null;
  imageUrl: string | null;
  thumbUrl: string | null;
  videoUrl: string | null;
  equipment: string | null;
  primaryMuscles: string | null;
  secondaryMuscles: string | null;
  createdAt: Date;
};

export type CreateExerciseInput = {
  id: string;
  trainerId: string;
  name: string;
  category: string;
  subgroup?: string | null;
  description?: string | null;
  defaultReps?: number | null;
  defaultWeightKg?: number | null;
  defaultTimeSec?: number | null;
  restSec: number;
  note?: string | null;
  // Медиа/справочные поля каталога — переносятся при создании варианта базового
  // упражнения (sourceExerciseId), чтобы у личной копии остались фото/видео/мышцы.
  imageUrl?: string | null;
  thumbUrl?: string | null;
  videoUrl?: string | null;
  equipment?: string | null;
  primaryMuscles?: string | null;
  secondaryMuscles?: string | null;
};

export type UpdateExerciseInput = {
  name?: string;
  category?: string;
  subgroup?: string | null;
  description?: string | null;
  defaultReps?: number | null;
  defaultWeightKg?: number | null;
  defaultTimeSec?: number | null;
  restSec?: number;
  note?: string | null;
};

const cols = {
  id: exercises.id,
  trainerId: exercises.trainerId,
  name: exercises.name,
  category: exercises.category,
  subgroup: exercises.subgroup,
  description: exercises.description,
  defaultReps: exercises.defaultReps,
  defaultWeightKg: exercises.defaultWeightKg,
  defaultTimeSec: exercises.defaultTimeSec,
  restSec: exercises.restSec,
  note: exercises.note,
  imageUrl: exercises.imageUrl,
  thumbUrl: exercises.thumbUrl,
  videoUrl: exercises.videoUrl,
  equipment: exercises.equipment,
  primaryMuscles: exercises.primaryMuscles,
  secondaryMuscles: exercises.secondaryMuscles,
  createdAt: exercises.createdAt,
};

// Маппинг строки БД в ответ API. isGlobal = системная запись (trainer_id IS NULL).
export function toResponse(r: ExerciseRow): ExerciseResponse {
  return {
    id: r.id,
    isGlobal: r.trainerId === null,
    name: r.name,
    category: r.category,
    subgroup: r.subgroup,
    description: r.description,
    defaultReps: r.defaultReps,
    defaultWeightKg: r.defaultWeightKg,
    defaultTimeSec: r.defaultTimeSec,
    restSec: r.restSec,
    note: r.note,
    imageUrl: r.imageUrl,
    thumbUrl: r.thumbUrl,
    videoUrl: r.videoUrl,
    equipment: r.equipment,
    primaryMuscles: r.primaryMuscles,
    secondaryMuscles: r.secondaryMuscles,
  };
}

export function makeExercisesRepo(db: Db) {
  return {
    // Личные записи тренера + глобальные системные, сортировка по name.
    async list(trainerId: string): Promise<ExerciseRow[]> {
      return db
        .select(cols)
        .from(exercises)
        .where(or(eq(exercises.trainerId, trainerId), isNull(exercises.trainerId)))
        .orderBy(asc(exercises.name));
    },

    // Запись видима, если она личная этого тренера ИЛИ глобальная; иначе null.
    async getVisible(trainerId: string, id: string): Promise<ExerciseRow | null> {
      const [row] = await db
        .select(cols)
        .from(exercises)
        .where(
          and(
            eq(exercises.id, id),
            or(eq(exercises.trainerId, trainerId), isNull(exercises.trainerId)),
          ),
        );
      return row ?? null;
    },

    // Только личная запись тренера (для update/delete); null если глобальная/чужая.
    async getOwn(trainerId: string, id: string): Promise<ExerciseRow | null> {
      const [row] = await db
        .select(cols)
        .from(exercises)
        .where(and(eq(exercises.id, id), eq(exercises.trainerId, trainerId)));
      return row ?? null;
    },

    async create(input: CreateExerciseInput): Promise<ExerciseRow> {
      const [row] = await db
        .insert(exercises)
        .values({
          id: input.id,
          trainerId: input.trainerId,
          name: input.name,
          category: input.category,
          subgroup: input.subgroup ?? null,
          description: input.description ?? null,
          defaultReps: input.defaultReps ?? null,
          defaultWeightKg: input.defaultWeightKg ?? null,
          defaultTimeSec: input.defaultTimeSec ?? null,
          restSec: input.restSec,
          note: input.note ?? null,
          imageUrl: input.imageUrl ?? null,
          thumbUrl: input.thumbUrl ?? null,
          videoUrl: input.videoUrl ?? null,
          equipment: input.equipment ?? null,
          primaryMuscles: input.primaryMuscles ?? null,
          secondaryMuscles: input.secondaryMuscles ?? null,
        })
        .returning(cols);
      if (!row) throw new Error('insert failed');
      return row;
    },

    // Апдейт только своей записи; вернуть строку или null (глобальную/чужую не трогаем).
    async update(
      trainerId: string,
      id: string,
      patch: UpdateExerciseInput,
    ): Promise<ExerciseRow | null> {
      const set: UpdateExerciseInput = {};
      if (patch.name !== undefined) set.name = patch.name;
      if (patch.category !== undefined) set.category = patch.category;
      if (patch.subgroup !== undefined) set.subgroup = patch.subgroup;
      if (patch.description !== undefined) set.description = patch.description;
      if (patch.defaultReps !== undefined) set.defaultReps = patch.defaultReps;
      if (patch.defaultWeightKg !== undefined) set.defaultWeightKg = patch.defaultWeightKg;
      if (patch.defaultTimeSec !== undefined) set.defaultTimeSec = patch.defaultTimeSec;
      if (patch.restSec !== undefined) set.restSec = patch.restSec;
      if (patch.note !== undefined) set.note = patch.note;

      if (Object.keys(set).length === 0) {
        // Пустой патч — вернуть текущую запись, если она своя.
        const [row] = await db
          .select(cols)
          .from(exercises)
          .where(and(eq(exercises.id, id), eq(exercises.trainerId, trainerId)));
        return row ?? null;
      }

      const [row] = await db
        .update(exercises)
        .set(set)
        .where(and(eq(exercises.id, id), eq(exercises.trainerId, trainerId)))
        .returning(cols);
      return row ?? null;
    },

    // Удаление только своей записи.
    // 'deleted' — удалено; 'not_found' — глобальная/чужая/несуществующая;
    // 'in_use' — упражнение ссылается из шаблона/тренировки (FK violation 23503).
    async delete(trainerId: string, id: string): Promise<'deleted' | 'not_found' | 'in_use'> {
      try {
        const res = await db
          .delete(exercises)
          .where(and(eq(exercises.id, id), eq(exercises.trainerId, trainerId)))
          .returning({ id: exercises.id });
        return res.length > 0 ? 'deleted' : 'not_found';
      } catch (err) {
        // postgres-js поднимает PostgresError с SQLSTATE-кодом в .code.
        if (err && typeof err === 'object' && (err as { code?: unknown }).code === '23503') {
          return 'in_use';
        }
        throw err;
      }
    },
  };
}

export type ExercisesRepo = ReturnType<typeof makeExercisesRepo>;
