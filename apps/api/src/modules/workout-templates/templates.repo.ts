import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { exercises, workoutTemplates, workoutTemplateExercises } from '../../db/schema.js';

// Позиция упражнения в шаблоне с резолвленным именем упражнения.
export type TemplateExerciseRow = {
  position: number;
  exerciseId: string;
  exerciseName: string;
  sets: number;
  reps: number | null;
  weightKg: number | null;
  timeSec: number | null;
  restSec: number;
};

export type TemplateRow = {
  id: string;
  trainerId: string;
  name: string;
  categoryTag: string | null;
  createdAt: Date;
  exercises: TemplateExerciseRow[];
};

// Входная позиция (без position — порядок задаёт индекс массива).
export type TemplateExerciseInput = {
  exerciseId: string;
  sets: number;
  reps?: number | null;
  weightKg?: number | null;
  timeSec?: number | null;
  restSec: number;
};

export type CreateTemplateInput = {
  id: string;
  trainerId: string;
  name: string;
  categoryTag?: string | null;
  exercises: TemplateExerciseInput[];
};

export type UpdateTemplateInput = {
  name?: string;
  categoryTag?: string | null;
  // undefined = не трогать список; массив = заменить целиком.
  exercises?: TemplateExerciseInput[];
};

export function makeTemplatesRepo(db: Db) {
  // Все exerciseId видимы тренеру (личные его ИЛИ глобальные). Пустой список → true.
  async function areExercisesVisible(trainerId: string, exerciseIds: string[]): Promise<boolean> {
    const unique = [...new Set(exerciseIds)];
    if (unique.length === 0) return true;
    const rows = await db
      .select({ id: exercises.id })
      .from(exercises)
      .where(
        and(
          inArray(exercises.id, unique),
          or(eq(exercises.trainerId, trainerId), isNull(exercises.trainerId)),
        ),
      );
    return rows.length === unique.length;
  }

  // Позиции шаблона с резолвом имени упражнения, по возрастанию position.
  async function loadExercises(templateId: string): Promise<TemplateExerciseRow[]> {
    return db
      .select({
        position: workoutTemplateExercises.position,
        exerciseId: workoutTemplateExercises.exerciseId,
        exerciseName: exercises.name,
        sets: workoutTemplateExercises.sets,
        reps: workoutTemplateExercises.reps,
        weightKg: workoutTemplateExercises.weightKg,
        timeSec: workoutTemplateExercises.timeSec,
        restSec: workoutTemplateExercises.restSec,
      })
      .from(workoutTemplateExercises)
      .innerJoin(exercises, eq(exercises.id, workoutTemplateExercises.exerciseId))
      .where(eq(workoutTemplateExercises.templateId, templateId))
      .orderBy(asc(workoutTemplateExercises.position));
  }

  async function getForTrainer(trainerId: string, templateId: string): Promise<TemplateRow | null> {
    const [head] = await db
      .select({
        id: workoutTemplates.id,
        trainerId: workoutTemplates.trainerId,
        name: workoutTemplates.name,
        categoryTag: workoutTemplates.categoryTag,
        createdAt: workoutTemplates.createdAt,
      })
      .from(workoutTemplates)
      .where(and(eq(workoutTemplates.id, templateId), eq(workoutTemplates.trainerId, trainerId)));
    if (!head) return null;
    const exRows = await loadExercises(templateId);
    return { ...head, exercises: exRows };
  }

  // Вставка позиций 0..n из входного массива по порядку (внутри транзакции tx).
  async function insertExercises(
    tx: Parameters<Parameters<Db['transaction']>[0]>[0],
    templateId: string,
    items: TemplateExerciseInput[],
  ): Promise<void> {
    if (items.length === 0) return;
    await tx.insert(workoutTemplateExercises).values(
      items.map((it, position) => ({
        templateId,
        position,
        exerciseId: it.exerciseId,
        sets: it.sets,
        reps: it.reps ?? null,
        weightKg: it.weightKg ?? null,
        timeSec: it.timeSec ?? null,
        restSec: it.restSec,
      })),
    );
  }

  return {
    areExercisesVisible,
    getForTrainer,

    // null = одно из упражнений невидимо тренеру (сигнал service → UNKNOWN_EXERCISE).
    async create(trainerId: string, input: CreateTemplateInput): Promise<TemplateRow | null> {
      const visible = await areExercisesVisible(
        trainerId,
        input.exercises.map((e) => e.exerciseId),
      );
      if (!visible) return null;

      await db.transaction(async (tx) => {
        await tx.insert(workoutTemplates).values({
          id: input.id,
          trainerId,
          name: input.name,
          categoryTag: input.categoryTag ?? null,
        });
        await insertExercises(tx, input.id, input.exercises);
      });
      return getForTrainer(trainerId, input.id);
    },

    async listByTrainer(trainerId: string): Promise<TemplateRow[]> {
      const heads = await db
        .select({
          id: workoutTemplates.id,
          trainerId: workoutTemplates.trainerId,
          name: workoutTemplates.name,
          categoryTag: workoutTemplates.categoryTag,
          createdAt: workoutTemplates.createdAt,
        })
        .from(workoutTemplates)
        .where(eq(workoutTemplates.trainerId, trainerId))
        .orderBy(asc(workoutTemplates.name));
      const result: TemplateRow[] = [];
      for (const head of heads) {
        const exRows = await loadExercises(head.id);
        result.push({ ...head, exercises: exRows });
      }
      return result;
    },

    // null = чужой/нет ИЛИ невидимое упражнение в новом списке.
    async update(
      trainerId: string,
      templateId: string,
      patch: UpdateTemplateInput,
    ): Promise<TemplateRow | null> {
      const existing = await getForTrainer(trainerId, templateId);
      if (!existing) return null;

      if (patch.exercises !== undefined) {
        const visible = await areExercisesVisible(
          trainerId,
          patch.exercises.map((e) => e.exerciseId),
        );
        if (!visible) return null;
      }

      const headPatch: Partial<{ name: string; categoryTag: string | null }> = {};
      if (patch.name !== undefined) headPatch.name = patch.name;
      if (patch.categoryTag !== undefined) headPatch.categoryTag = patch.categoryTag;

      await db.transaction(async (tx) => {
        if (Object.keys(headPatch).length > 0) {
          await tx
            .update(workoutTemplates)
            .set(headPatch)
            .where(
              and(eq(workoutTemplates.id, templateId), eq(workoutTemplates.trainerId, trainerId)),
            );
        }
        if (patch.exercises !== undefined) {
          await tx
            .delete(workoutTemplateExercises)
            .where(eq(workoutTemplateExercises.templateId, templateId));
          await insertExercises(tx, templateId, patch.exercises);
        }
      });
      return getForTrainer(trainerId, templateId);
    },

    async delete(trainerId: string, templateId: string): Promise<boolean> {
      const res = await db
        .delete(workoutTemplates)
        .where(and(eq(workoutTemplates.id, templateId), eq(workoutTemplates.trainerId, trainerId)))
        .returning({ id: workoutTemplates.id });
      return res.length > 0;
    },
  };
}

export type TemplatesRepo = ReturnType<typeof makeTemplatesRepo>;
