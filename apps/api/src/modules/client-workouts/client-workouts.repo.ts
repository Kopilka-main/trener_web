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

    async listForClient(trainerId: string, clientId: string): Promise<WorkoutRow[]> {
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
          createdAt: clientWorkouts.createdAt,
        })
        .from(clientWorkouts)
        .where(and(eq(clientWorkouts.trainerId, trainerId), eq(clientWorkouts.clientId, clientId)))
        .orderBy(desc(clientWorkouts.createdAt));

      const result: WorkoutRow[] = [];
      for (const head of heads) {
        const exRows = await loadExercises(head.id);
        result.push({ ...head, exercises: exRows });
      }
      return result;
    },

    // Перевод в active со startedAt; false если тренировка не принадлежит паре.
    async setStatusActive(
      trainerId: string,
      clientId: string,
      workoutId: string,
      startedAt: Date,
    ): Promise<boolean> {
      const res = await db
        .update(clientWorkouts)
        .set({ status: 'active', startedAt })
        .where(
          and(
            eq(clientWorkouts.id, workoutId),
            eq(clientWorkouts.trainerId, trainerId),
            eq(clientWorkouts.clientId, clientId),
          ),
        )
        .returning({ id: clientWorkouts.id });
      return res.length > 0;
    },

    // Апдейт факта подхода только если тренировка принадлежит паре; null если не найдено.
    async updateSet(
      trainerId: string,
      clientId: string,
      workoutId: string,
      position: number,
      setIndex: number,
      patch: SetPatchInput,
    ): Promise<WorkoutRow | null> {
      const head = await loadHead(trainerId, clientId, workoutId);
      if (!head) return null;

      const setPatch: Partial<{
        actualReps: number | null;
        actualWeightKg: number | null;
        actualTimeSec: number | null;
        done: number;
      }> = {};
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

    // Перевод в completed; false если тренировка не принадлежит паре.
    async complete(
      trainerId: string,
      clientId: string,
      workoutId: string,
      input: CompleteInput,
      completedAt: Date,
    ): Promise<boolean> {
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

      const res = await db
        .update(clientWorkouts)
        .set(headPatch)
        .where(
          and(
            eq(clientWorkouts.id, workoutId),
            eq(clientWorkouts.trainerId, trainerId),
            eq(clientWorkouts.clientId, clientId),
          ),
        )
        .returning({ id: clientWorkouts.id });
      return res.length > 0;
    },

    async remove(trainerId: string, clientId: string, workoutId: string): Promise<boolean> {
      const res = await db
        .delete(clientWorkouts)
        .where(
          and(
            eq(clientWorkouts.id, workoutId),
            eq(clientWorkouts.trainerId, trainerId),
            eq(clientWorkouts.clientId, clientId),
          ),
        )
        .returning({ id: clientWorkouts.id });
      return res.length > 0;
    },
  };
}

export type ClientWorkoutsRepo = ReturnType<typeof makeClientWorkoutsRepo>;
