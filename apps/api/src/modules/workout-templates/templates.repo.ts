import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import {
  clients,
  exercises,
  trainerClients,
  workoutTemplates,
  workoutTemplateExercises,
} from '../../db/schema.js';

// firstName + lastName клиента (trim). null, если клиента нет (общий шаблон / LEFT JOIN мимо).
function buildClientName(firstName: string | null, lastName: string | null): string | null {
  const full = `${firstName ?? ''} ${lastName ?? ''}`.trim();
  return full.length > 0 ? full : null;
}

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
  shortDescription: string | null;
  // null = общий шаблон; задан = персональный шаблон клиента (clientName — подпись «для: Имя»).
  clientId: string | null;
  clientName: string | null;
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
  // Задан → персональный шаблон клиента. Связь клиента с тренером сервис проверяет
  // ДО вызова create (repo.isClientLinked); здесь только запись значения.
  clientId?: string | null;
  name: string;
  categoryTag?: string | null;
  shortDescription?: string | null;
  exercises: TemplateExerciseInput[];
};

export type UpdateTemplateInput = {
  name?: string;
  categoryTag?: string | null;
  shortDescription?: string | null;
  // undefined = не трогать список; массив = заменить целиком.
  exercises?: TemplateExerciseInput[];
};

// Колонки «шапки» шаблона + имя клиента через LEFT JOIN clients (общий → null-имя).
const headCols = {
  id: workoutTemplates.id,
  trainerId: workoutTemplates.trainerId,
  name: workoutTemplates.name,
  categoryTag: workoutTemplates.categoryTag,
  shortDescription: workoutTemplates.shortDescription,
  clientId: workoutTemplates.clientId,
  clientFirstName: clients.firstName,
  clientLastName: clients.lastName,
  createdAt: workoutTemplates.createdAt,
};

// Строка headCols → шапка TemplateRow (без exercises): собирает clientName из имени клиента.
function toHead(h: {
  id: string;
  trainerId: string;
  name: string;
  categoryTag: string | null;
  shortDescription: string | null;
  clientId: string | null;
  clientFirstName: string | null;
  clientLastName: string | null;
  createdAt: Date;
}): Omit<TemplateRow, 'exercises'> {
  return {
    id: h.id,
    trainerId: h.trainerId,
    name: h.name,
    categoryTag: h.categoryTag,
    shortDescription: h.shortDescription,
    clientId: h.clientId,
    clientName: buildClientName(h.clientFirstName, h.clientLastName),
    createdAt: h.createdAt,
  };
}

export function makeTemplatesRepo(db: Db) {
  // Связан ли клиент с тренером (запись в trainer_clients). Скоуп персонального шаблона:
  // сервис зовёт ДО create, чтобы не завести шаблон под чужого клиента.
  async function isClientLinked(trainerId: string, clientId: string): Promise<boolean> {
    const [row] = await db
      .select({ clientId: trainerClients.clientId })
      .from(trainerClients)
      .where(and(eq(trainerClients.trainerId, trainerId), eq(trainerClients.clientId, clientId)));
    return !!row;
  }

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
      .select(headCols)
      .from(workoutTemplates)
      .leftJoin(clients, eq(clients.id, workoutTemplates.clientId))
      .where(and(eq(workoutTemplates.id, templateId), eq(workoutTemplates.trainerId, trainerId)));
    if (!head) return null;
    const exRows = await loadExercises(templateId);
    return { ...toHead(head), exercises: exRows };
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
    isClientLinked,
    getForTrainer,

    // null = одно из упражнений невидимо тренеру (сигнал service → UNKNOWN_EXERCISE).
    // clientId (персональный шаблон) уже проверен сервисом через isClientLinked.
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
          clientId: input.clientId ?? null,
          name: input.name,
          categoryTag: input.categoryTag ?? null,
          shortDescription: input.shortDescription ?? null,
        });
        await insertExercises(tx, input.id, input.exercises);
      });
      return getForTrainer(trainerId, input.id);
    },

    async listByTrainer(trainerId: string): Promise<TemplateRow[]> {
      const heads = await db
        .select(headCols)
        .from(workoutTemplates)
        .leftJoin(clients, eq(clients.id, workoutTemplates.clientId))
        .where(eq(workoutTemplates.trainerId, trainerId))
        .orderBy(asc(workoutTemplates.name));
      const result: TemplateRow[] = [];
      for (const head of heads) {
        const exRows = await loadExercises(head.id);
        result.push({ ...toHead(head), exercises: exRows });
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

      const headPatch: Partial<{
        name: string;
        categoryTag: string | null;
        shortDescription: string | null;
      }> = {};
      if (patch.name !== undefined) headPatch.name = patch.name;
      if (patch.categoryTag !== undefined) headPatch.categoryTag = patch.categoryTag;
      if (patch.shortDescription !== undefined) headPatch.shortDescription = patch.shortDescription;

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
