import { and, asc, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import {
  clientWorkouts,
  clientWorkoutExercises,
  clientWorkoutSets,
  exercises,
} from '../../db/schema.js';

export type WorkoutSetRow = {
  setIndex: number;
  plannedReps: number | null;
  plannedWeightKg: number | null;
  plannedTimeSec: number | null;
  plannedRestSec: number | null;
  actualReps: number | null;
  actualWeightKg: number | null;
  actualTimeSec: number | null;
  done: boolean;
};

export type WorkoutExerciseRow = {
  position: number;
  exerciseId: string;
  exerciseName: string;
  sets: WorkoutSetRow[];
};

export type WorkoutStatus = 'draft' | 'active' | 'completed' | 'skipped';

export type WorkoutRow = {
  id: string;
  trainerId: string;
  clientId: string;
  name: string;
  status: WorkoutStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  durationSec: number | null;
  trainerNote: string | null;
  rpe: number | null;
  createdByClient: boolean;
  createdAt: Date;
  exercises: WorkoutExerciseRow[];
};

// Входной план подхода (без setIndex — порядок задаёт индекс массива).
export type PlannedSetInput = {
  plannedReps?: number | null;
  plannedWeightKg?: number | null;
  plannedTimeSec?: number | null;
  plannedRestSec?: number | null;
};

// Входная позиция упражнения с набором плановых подходов.
export type WorkoutExerciseInput = {
  exerciseId: string;
  sets: PlannedSetInput[];
};

export type CreateWorkoutInput = {
  id: string;
  name: string;
  sourceTemplateId?: string | null;
  exercises: WorkoutExerciseInput[];
};

export type SetPatchInput = {
  plannedReps?: number | null;
  plannedWeightKg?: number | null;
  plannedTimeSec?: number | null;
  plannedRestSec?: number | null;
  actualReps?: number | null;
  actualWeightKg?: number | null;
  actualTimeSec?: number | null;
  done?: boolean;
};

export type CompleteInput = {
  durationSec?: number | null;
  trainerNote?: string | null;
  rpe?: number | null;
};

// Результат атомарного статус-перехода: 'updated' — переведено; 'not_found' — нет
// тренировки в паре (тренер,клиент); 'bad_status' — есть, но статус не позволяет переход.
export type StatusTransitionResult = 'updated' | 'not_found' | 'bad_status';

// Транзакционный хэндл drizzle (аргумент db.transaction). Тот же query-API, что и Db.
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export function makeClientWorkoutsRepo(db: Db) {
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

  // Шапка тренировки в scope пары (тренер, клиент), либо null.
  async function loadHead(
    trainerId: string,
    clientId: string,
    workoutId: string,
  ): Promise<Omit<WorkoutRow, 'exercises'> | null> {
    const [head] = await db
      .select({
        id: clientWorkouts.id,
        trainerId: clientWorkouts.trainerId,
        clientId: clientWorkouts.clientId,
        name: clientWorkouts.name,
        status: clientWorkouts.status,
        startedAt: clientWorkouts.startedAt,
        completedAt: clientWorkouts.completedAt,
        durationSec: clientWorkouts.durationSec,
        trainerNote: clientWorkouts.trainerNote,
        rpe: clientWorkouts.rpe,
        createdByClient: clientWorkouts.createdByClient,
        createdAt: clientWorkouts.createdAt,
      })
      .from(clientWorkouts)
      .where(
        and(
          eq(clientWorkouts.id, workoutId),
          eq(clientWorkouts.trainerId, trainerId),
          eq(clientWorkouts.clientId, clientId),
        ),
      );
    return head ?? null;
  }

  // Упражнения тренировки с резолвом имени + вложенными подходами, по позиции/индексу.
  async function loadExercises(workoutId: string): Promise<WorkoutExerciseRow[]> {
    const exRows = await db
      .select({
        position: clientWorkoutExercises.position,
        exerciseId: clientWorkoutExercises.exerciseId,
        exerciseName: exercises.name,
      })
      .from(clientWorkoutExercises)
      .innerJoin(exercises, eq(exercises.id, clientWorkoutExercises.exerciseId))
      .where(eq(clientWorkoutExercises.workoutId, workoutId))
      .orderBy(asc(clientWorkoutExercises.position));

    const setRows = await db
      .select({
        exercisePosition: clientWorkoutSets.exercisePosition,
        setIndex: clientWorkoutSets.setIndex,
        plannedReps: clientWorkoutSets.plannedReps,
        plannedWeightKg: clientWorkoutSets.plannedWeightKg,
        plannedTimeSec: clientWorkoutSets.plannedTimeSec,
        plannedRestSec: clientWorkoutSets.plannedRestSec,
        actualReps: clientWorkoutSets.actualReps,
        actualWeightKg: clientWorkoutSets.actualWeightKg,
        actualTimeSec: clientWorkoutSets.actualTimeSec,
        done: clientWorkoutSets.done,
      })
      .from(clientWorkoutSets)
      .where(eq(clientWorkoutSets.workoutId, workoutId))
      .orderBy(asc(clientWorkoutSets.exercisePosition), asc(clientWorkoutSets.setIndex));

    return exRows.map((ex) => ({
      position: ex.position,
      exerciseId: ex.exerciseId,
      exerciseName: ex.exerciseName,
      sets: setRows
        .filter((s) => s.exercisePosition === ex.position)
        .map((s) => ({
          setIndex: s.setIndex,
          plannedReps: s.plannedReps,
          plannedWeightKg: s.plannedWeightKg,
          plannedTimeSec: s.plannedTimeSec,
          plannedRestSec: s.plannedRestSec,
          actualReps: s.actualReps,
          actualWeightKg: s.actualWeightKg,
          actualTimeSec: s.actualTimeSec,
          done: s.done !== 0,
        })),
    }));
  }

  // Пересборка упражнений+подходов тренировки в порядке newOrder (массив СТАРЫХ позиций):
  // новая position = индекс в newOrder. Делаем delete+reinsert внутри tx, т.к. position входит
  // в PK упражнений и FK подходов (workoutId, exercise_position) — апдейт «на месте» ловит
  // конфликты уникальности/FK. newOrder обязан содержать ровно все текущие позиции.
  async function rewriteExercises(tx: Tx, workoutId: string, newOrder: number[]): Promise<void> {
    const exRows = await tx
      .select({
        position: clientWorkoutExercises.position,
        exerciseId: clientWorkoutExercises.exerciseId,
      })
      .from(clientWorkoutExercises)
      .where(eq(clientWorkoutExercises.workoutId, workoutId));
    const setRows = await tx
      .select({
        exercisePosition: clientWorkoutSets.exercisePosition,
        setIndex: clientWorkoutSets.setIndex,
        plannedReps: clientWorkoutSets.plannedReps,
        plannedWeightKg: clientWorkoutSets.plannedWeightKg,
        plannedTimeSec: clientWorkoutSets.plannedTimeSec,
        plannedRestSec: clientWorkoutSets.plannedRestSec,
        actualReps: clientWorkoutSets.actualReps,
        actualWeightKg: clientWorkoutSets.actualWeightKg,
        actualTimeSec: clientWorkoutSets.actualTimeSec,
        done: clientWorkoutSets.done,
      })
      .from(clientWorkoutSets)
      .where(eq(clientWorkoutSets.workoutId, workoutId));

    const exByPos = new Map(exRows.map((e) => [e.position, e.exerciseId]));

    // Сначала подходы (FK на упражнения), затем сами упражнения.
    await tx.delete(clientWorkoutSets).where(eq(clientWorkoutSets.workoutId, workoutId));
    await tx.delete(clientWorkoutExercises).where(eq(clientWorkoutExercises.workoutId, workoutId));

    if (newOrder.length === 0) return;

    await tx.insert(clientWorkoutExercises).values(
      newOrder.map((oldPos, newPos) => ({
        workoutId,
        position: newPos,
        exerciseId: exByPos.get(oldPos) ?? '',
      })),
    );

    const newSets = newOrder.flatMap((oldPos, newPos) =>
      setRows
        .filter((s) => s.exercisePosition === oldPos)
        .map((s) => ({
          workoutId,
          exercisePosition: newPos,
          setIndex: s.setIndex,
          plannedReps: s.plannedReps,
          plannedWeightKg: s.plannedWeightKg,
          plannedTimeSec: s.plannedTimeSec,
          plannedRestSec: s.plannedRestSec,
          actualReps: s.actualReps,
          actualWeightKg: s.actualWeightKg,
          actualTimeSec: s.actualTimeSec,
          done: s.done,
        })),
    );
    if (newSets.length > 0) await tx.insert(clientWorkoutSets).values(newSets);
  }

  async function getFull(
    trainerId: string,
    clientId: string,
    workoutId: string,
  ): Promise<WorkoutRow | null> {
    const head = await loadHead(trainerId, clientId, workoutId);
    if (!head) return null;
    const exRows = await loadExercises(workoutId);
    return { ...head, exercises: exRows };
  }

  return {
    areExercisesVisible,
    getFull,

    // null = одно из упражнений невидимо тренеру (сигнал service → UNKNOWN_EXERCISE).
    async create(
      trainerId: string,
      clientId: string,
      plan: CreateWorkoutInput,
      createdByClient = false,
    ): Promise<WorkoutRow | null> {
      const visible = await areExercisesVisible(
        trainerId,
        plan.exercises.map((e) => e.exerciseId),
      );
      if (!visible) return null;

      await db.transaction(async (tx) => {
        await tx.insert(clientWorkouts).values({
          id: plan.id,
          trainerId,
          clientId,
          sourceTemplateId: plan.sourceTemplateId ?? null,
          name: plan.name,
          status: 'draft',
          createdByClient,
        });
        await tx.insert(clientWorkoutExercises).values(
          plan.exercises.map((ex, position) => ({
            workoutId: plan.id,
            position,
            exerciseId: ex.exerciseId,
          })),
        );
        const setValues = plan.exercises.flatMap((ex, position) =>
          ex.sets.map((s, setIndex) => ({
            workoutId: plan.id,
            exercisePosition: position,
            setIndex,
            plannedReps: s.plannedReps ?? null,
            plannedWeightKg: s.plannedWeightKg ?? null,
            plannedTimeSec: s.plannedTimeSec ?? null,
            plannedRestSec: s.plannedRestSec ?? null,
            done: 0,
          })),
        );
        if (setValues.length > 0) await tx.insert(clientWorkoutSets).values(setValues);
      });
      return getFull(trainerId, clientId, plan.id);
    },

    async listForClient(
      trainerId: string,
      clientId: string,
      owner: 'trainer' | 'all' = 'all',
    ): Promise<WorkoutRow[]> {
      // owner='trainer' → только тренерские (createdByClient=false): тренер не видит
      // самостоятельные тренировки клиента; 'all' → свои + тренерские (клиентский фасад).
      const ownerCond = owner === 'trainer' ? eq(clientWorkouts.createdByClient, false) : undefined;
      const heads = await db
        .select({
          id: clientWorkouts.id,
          trainerId: clientWorkouts.trainerId,
          clientId: clientWorkouts.clientId,
          name: clientWorkouts.name,
          status: clientWorkouts.status,
          startedAt: clientWorkouts.startedAt,
          completedAt: clientWorkouts.completedAt,
          durationSec: clientWorkouts.durationSec,
          trainerNote: clientWorkouts.trainerNote,
          rpe: clientWorkouts.rpe,
          createdByClient: clientWorkouts.createdByClient,
          createdAt: clientWorkouts.createdAt,
        })
        .from(clientWorkouts)
        .where(
          and(
            eq(clientWorkouts.trainerId, trainerId),
            eq(clientWorkouts.clientId, clientId),
            ownerCond,
          ),
        )
        .orderBy(desc(clientWorkouts.createdAt));

      const result: WorkoutRow[] = [];
      for (const head of heads) {
        const exRows = await loadExercises(head.id);
        result.push({ ...head, exercises: exRows });
      }
      return result;
    },

    // Атомарный перевод draft → active со startedAt. Условие статуса в WHERE убирает
    // TOCTOU; различаем not_found (нет в паре) vs bad_status (есть, но не draft).
    async setStatusActive(
      trainerId: string,
      clientId: string,
      workoutId: string,
      startedAt: Date,
      ownedByClientOnly = false,
    ): Promise<StatusTransitionResult> {
      // ownedByClientOnly=true → клиент может стартовать только свою (createdByClient=true);
      // тренерская не попадёт в scope → 'not_found'.
      const scope = and(
        eq(clientWorkouts.id, workoutId),
        eq(clientWorkouts.trainerId, trainerId),
        eq(clientWorkouts.clientId, clientId),
        ownedByClientOnly ? eq(clientWorkouts.createdByClient, true) : undefined,
      );
      const res = await db
        .update(clientWorkouts)
        .set({ status: 'active', startedAt })
        .where(and(scope, eq(clientWorkouts.status, 'draft')))
        .returning({ id: clientWorkouts.id });
      if (res.length > 0) return 'updated';
      // Ноль строк: либо нет тренировки в паре, либо статус не draft — различаем.
      const [exists] = await db.select({ id: clientWorkouts.id }).from(clientWorkouts).where(scope);
      return exists ? 'bad_status' : 'not_found';
    },

    // Апдейт факта подхода только если тренировка принадлежит паре; null если не найдено.
    async updateSet(
      trainerId: string,
      clientId: string,
      workoutId: string,
      position: number,
      setIndex: number,
      patch: SetPatchInput,
      ownedByClientOnly = false,
    ): Promise<WorkoutRow | null> {
      const head = await loadHead(trainerId, clientId, workoutId);
      // ownedByClientOnly=true и тренировка не самостоятельная → как «не найдено».
      if (!head || (ownedByClientOnly && !head.createdByClient)) return null;

      const setPatch: Partial<{
        plannedReps: number | null;
        plannedWeightKg: number | null;
        plannedTimeSec: number | null;
        plannedRestSec: number | null;
        actualReps: number | null;
        actualWeightKg: number | null;
        actualTimeSec: number | null;
        done: number;
      }> = {};
      if (patch.plannedReps !== undefined) setPatch.plannedReps = patch.plannedReps ?? null;
      if (patch.plannedWeightKg !== undefined)
        setPatch.plannedWeightKg = patch.plannedWeightKg ?? null;
      if (patch.plannedTimeSec !== undefined)
        setPatch.plannedTimeSec = patch.plannedTimeSec ?? null;
      if (patch.plannedRestSec !== undefined)
        setPatch.plannedRestSec = patch.plannedRestSec ?? null;
      if (patch.actualReps !== undefined) setPatch.actualReps = patch.actualReps ?? null;
      if (patch.actualWeightKg !== undefined)
        setPatch.actualWeightKg = patch.actualWeightKg ?? null;
      if (patch.actualTimeSec !== undefined) setPatch.actualTimeSec = patch.actualTimeSec ?? null;
      if (patch.done !== undefined) setPatch.done = patch.done ? 1 : 0;

      if (Object.keys(setPatch).length > 0) {
        const res = await db
          .update(clientWorkoutSets)
          .set(setPatch)
          .where(
            and(
              eq(clientWorkoutSets.workoutId, workoutId),
              eq(clientWorkoutSets.exercisePosition, position),
              eq(clientWorkoutSets.setIndex, setIndex),
            ),
          )
          .returning({ workoutId: clientWorkoutSets.workoutId });
        // Подход не найден (несуществующая позиция/индекс) → 404 через service.
        if (res.length === 0) return null;
      }

      return getFull(trainerId, clientId, workoutId);
    },

    // Атомарный перевод active → completed. Условие статуса в WHERE убирает TOCTOU;
    // различаем not_found (нет в паре) vs bad_status (есть, но не active).
    async complete(
      trainerId: string,
      clientId: string,
      workoutId: string,
      input: CompleteInput,
      completedAt: Date,
      ownedByClientOnly = false,
    ): Promise<StatusTransitionResult> {
      const headPatch: {
        status: WorkoutStatus;
        completedAt: Date;
        durationSec?: number | null;
        trainerNote?: string | null;
        rpe?: number | null;
      } = { status: 'completed', completedAt };
      if (input.durationSec !== undefined) headPatch.durationSec = input.durationSec ?? null;
      if (input.trainerNote !== undefined) headPatch.trainerNote = input.trainerNote ?? null;
      if (input.rpe !== undefined) headPatch.rpe = input.rpe ?? null;

      const scope = and(
        eq(clientWorkouts.id, workoutId),
        eq(clientWorkouts.trainerId, trainerId),
        eq(clientWorkouts.clientId, clientId),
        ownedByClientOnly ? eq(clientWorkouts.createdByClient, true) : undefined,
      );
      const res = await db
        .update(clientWorkouts)
        .set(headPatch)
        .where(and(scope, eq(clientWorkouts.status, 'active')))
        .returning({ id: clientWorkouts.id });
      if (res.length > 0) return 'updated';
      const [exists] = await db.select({ id: clientWorkouts.id }).from(clientWorkouts).where(scope);
      return exists ? 'bad_status' : 'not_found';
    },

    // Добавляет упражнение В КОНЕЦ (следующий position) с его плановыми подходами.
    // null = упражнение невидимо тренеру ИЛИ тренировки нет в паре (тренер,клиент).
    async addExercise(
      trainerId: string,
      clientId: string,
      workoutId: string,
      exercise: WorkoutExerciseInput,
      ownedByClientOnly = false,
    ): Promise<WorkoutRow | null> {
      const head = await loadHead(trainerId, clientId, workoutId);
      if (!head || (ownedByClientOnly && !head.createdByClient)) return null;
      const visible = await areExercisesVisible(trainerId, [exercise.exerciseId]);
      if (!visible) return null;

      await db.transaction(async (tx) => {
        const existing = await tx
          .select({ position: clientWorkoutExercises.position })
          .from(clientWorkoutExercises)
          .where(eq(clientWorkoutExercises.workoutId, workoutId));
        const nextPosition = existing.reduce((max, e) => Math.max(max, e.position + 1), 0);

        await tx.insert(clientWorkoutExercises).values({
          workoutId,
          position: nextPosition,
          exerciseId: exercise.exerciseId,
        });
        const setValues = exercise.sets.map((s, setIndex) => ({
          workoutId,
          exercisePosition: nextPosition,
          setIndex,
          plannedReps: s.plannedReps ?? null,
          plannedWeightKg: s.plannedWeightKg ?? null,
          plannedTimeSec: s.plannedTimeSec ?? null,
          plannedRestSec: s.plannedRestSec ?? null,
          done: 0,
        }));
        if (setValues.length > 0) await tx.insert(clientWorkoutSets).values(setValues);
      });
      return getFull(trainerId, clientId, workoutId);
    },

    // Удаляет упражнение на позиции pos (и его подходы), перенумеровывает оставшиеся 0..n-1.
    // null = тренировки нет в паре; 'not_found_pos' = такой позиции нет в тренировке.
    async removeExercise(
      trainerId: string,
      clientId: string,
      workoutId: string,
      pos: number,
      ownedByClientOnly = false,
    ): Promise<WorkoutRow | null | 'not_found_pos'> {
      const head = await loadHead(trainerId, clientId, workoutId);
      if (!head || (ownedByClientOnly && !head.createdByClient)) return null;

      const result = await db.transaction(async (tx) => {
        const rows = await tx
          .select({
            position: clientWorkoutExercises.position,
            exerciseId: clientWorkoutExercises.exerciseId,
          })
          .from(clientWorkoutExercises)
          .where(eq(clientWorkoutExercises.workoutId, workoutId))
          .orderBy(asc(clientWorkoutExercises.position));

        if (!rows.some((r) => r.position === pos)) return 'not_found_pos' as const;

        // Оставшиеся позиции в исходном порядке → их новые индексы 0..n-1.
        const remaining = rows.filter((r) => r.position !== pos);
        await rewriteExercises(
          tx,
          workoutId,
          remaining.map((r) => r.position),
        );
        return 'ok' as const;
      });

      if (result === 'not_found_pos') return 'not_found_pos';
      return getFull(trainerId, clientId, workoutId);
    },

    // Переставляет упражнения согласно order (массив старых position в новом порядке).
    // null = тренировки нет в паре; 'bad_order' = order не перестановка существующих позиций.
    async reorderExercises(
      trainerId: string,
      clientId: string,
      workoutId: string,
      order: number[],
    ): Promise<WorkoutRow | null | 'bad_order'> {
      const head = await loadHead(trainerId, clientId, workoutId);
      if (!head) return null;

      const result = await db.transaction(async (tx) => {
        const rows = await tx
          .select({ position: clientWorkoutExercises.position })
          .from(clientWorkoutExercises)
          .where(eq(clientWorkoutExercises.workoutId, workoutId));

        const existing = new Set(rows.map((r) => r.position));
        const requested = new Set(order);
        const isPermutation =
          order.length === existing.size &&
          requested.size === order.length &&
          order.every((p) => existing.has(p));
        if (!isPermutation) return 'bad_order' as const;

        await rewriteExercises(tx, workoutId, order);
        return 'ok' as const;
      });

      if (result === 'bad_order') return 'bad_order';
      return getFull(trainerId, clientId, workoutId);
    },

    async remove(
      trainerId: string,
      clientId: string,
      workoutId: string,
      ownedByClientOnly = false,
    ): Promise<boolean> {
      const res = await db
        .delete(clientWorkouts)
        .where(
          and(
            eq(clientWorkouts.id, workoutId),
            eq(clientWorkouts.trainerId, trainerId),
            eq(clientWorkouts.clientId, clientId),
            ownedByClientOnly ? eq(clientWorkouts.createdByClient, true) : undefined,
          ),
        )
        .returning({ id: clientWorkouts.id });
      return res.length > 0;
    },
  };
}

export type ClientWorkoutsRepo = ReturnType<typeof makeClientWorkoutsRepo>;
