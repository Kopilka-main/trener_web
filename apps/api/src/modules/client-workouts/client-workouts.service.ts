import type {
  ClientWorkoutsRepo,
  WorkoutRow,
  WorkoutExerciseInput,
  PlannedSetInput,
  SetPatchInput,
  CompleteInput,
} from './client-workouts.repo.js';
import type {
  CreateWorkoutRequest,
  WorkoutExercisePlan,
  PlannedSet,
  UpdateSetRequest,
  CompleteWorkoutRequest,
  AddWorkoutExerciseRequest,
  WorkoutResponse,
} from '@trener/shared';
import { AppError, notFound } from '../../errors.js';

export type ClientWorkoutsDeps = { newId: () => string; now: () => Date };

const unknownExercise = () =>
  new AppError(400, 'UNKNOWN_EXERCISE', 'Упражнение недоступно тренеру');
const badStatus = (message: string) => new AppError(409, 'BAD_STATUS', message);

function toResponse(r: WorkoutRow): WorkoutResponse {
  return {
    id: r.id,
    clientId: r.clientId,
    name: r.name,
    status: r.status,
    startedAt: r.startedAt ? r.startedAt.toISOString() : null,
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    durationSec: r.durationSec,
    trainerNote: r.trainerNote,
    rpe: r.rpe,
    exercises: r.exercises.map((e) => ({
      position: e.position,
      exerciseId: e.exerciseId,
      exerciseName: e.exerciseName,
      sets: e.sets.map((s) => ({
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
    })),
  };
}

// Контрактный план подхода → вход repo (exactOptionalPropertyTypes: только заданные поля).
function toSetInput(s: PlannedSet): PlannedSetInput {
  const item: PlannedSetInput = {};
  if (s.plannedReps != null) item.plannedReps = s.plannedReps;
  if (s.plannedWeightKg != null) item.plannedWeightKg = s.plannedWeightKg;
  if (s.plannedTimeSec != null) item.plannedTimeSec = s.plannedTimeSec;
  if (s.plannedRestSec != null) item.plannedRestSec = s.plannedRestSec;
  return item;
}

function toExerciseInput(e: WorkoutExercisePlan): WorkoutExerciseInput {
  return { exerciseId: e.exerciseId, sets: e.sets.map(toSetInput) };
}

export function makeClientWorkoutsService(repo: ClientWorkoutsRepo, deps: ClientWorkoutsDeps) {
  return {
    async create(
      trainerId: string,
      clientId: string,
      input: CreateWorkoutRequest,
    ): Promise<WorkoutResponse> {
      const plan = {
        id: deps.newId(),
        name: input.name,
        sourceTemplateId: input.sourceTemplateId ?? null,
        exercises: input.exercises.map(toExerciseInput),
      };
      const row = await repo.create(trainerId, clientId, plan);
      // null = одно из упражнений невидимо тренеру.
      if (!row) throw unknownExercise();
      return toResponse(row);
    },

    async list(trainerId: string, clientId: string): Promise<WorkoutResponse[]> {
      const rows = await repo.listForClient(trainerId, clientId);
      return rows.map(toResponse);
    },

    async get(trainerId: string, clientId: string, workoutId: string): Promise<WorkoutResponse> {
      const row = await repo.getFull(trainerId, clientId, workoutId);
      if (!row) throw notFound('Тренировка не найдена');
      return toResponse(row);
    },

    // draft → active атомарно. 404 (нет в паре) / 409 BAD_STATUS (не из черновика).
    async start(trainerId: string, clientId: string, workoutId: string): Promise<WorkoutResponse> {
      const res = await repo.setStatusActive(trainerId, clientId, workoutId, deps.now());
      if (res === 'not_found') throw notFound('Тренировка не найдена');
      if (res === 'bad_status') throw badStatus('Тренировку можно начать только из черновика');
      const updated = await repo.getFull(trainerId, clientId, workoutId);
      if (!updated) throw notFound('Тренировка не найдена');
      return toResponse(updated);
    },

    async updateSet(
      trainerId: string,
      clientId: string,
      workoutId: string,
      position: number,
      setIndex: number,
      patch: UpdateSetRequest,
    ): Promise<WorkoutResponse> {
      const repoPatch: SetPatchInput = {};
      if (patch.plannedReps !== undefined) repoPatch.plannedReps = patch.plannedReps ?? null;
      if (patch.plannedWeightKg !== undefined)
        repoPatch.plannedWeightKg = patch.plannedWeightKg ?? null;
      if (patch.plannedTimeSec !== undefined)
        repoPatch.plannedTimeSec = patch.plannedTimeSec ?? null;
      if (patch.plannedRestSec !== undefined)
        repoPatch.plannedRestSec = patch.plannedRestSec ?? null;
      if (patch.actualReps !== undefined) repoPatch.actualReps = patch.actualReps ?? null;
      if (patch.actualWeightKg !== undefined)
        repoPatch.actualWeightKg = patch.actualWeightKg ?? null;
      if (patch.actualTimeSec !== undefined) repoPatch.actualTimeSec = patch.actualTimeSec ?? null;
      if (patch.done !== undefined) repoPatch.done = patch.done;

      const row = await repo.updateSet(
        trainerId,
        clientId,
        workoutId,
        position,
        setIndex,
        repoPatch,
      );
      // null = тренировка не принадлежит паре ИЛИ подход не найден.
      if (!row) throw notFound('Подход не найден');
      return toResponse(row);
    },

    // active → completed атомарно. 404 (нет в паре) / 409 BAD_STATUS (не активна).
    async complete(
      trainerId: string,
      clientId: string,
      workoutId: string,
      input: CompleteWorkoutRequest,
    ): Promise<WorkoutResponse> {
      const repoInput: CompleteInput = {};
      if (input.durationSec !== undefined) repoInput.durationSec = input.durationSec ?? null;
      if (input.trainerNote !== undefined) repoInput.trainerNote = input.trainerNote ?? null;
      if (input.rpe !== undefined) repoInput.rpe = input.rpe ?? null;

      const res = await repo.complete(trainerId, clientId, workoutId, repoInput, deps.now());
      if (res === 'not_found') throw notFound('Тренировка не найдена');
      if (res === 'bad_status') throw badStatus('Завершить можно только активную тренировку');
      const updated = await repo.getFull(trainerId, clientId, workoutId);
      if (!updated) throw notFound('Тренировка не найдена');
      return toResponse(updated);
    },

    async remove(trainerId: string, clientId: string, workoutId: string): Promise<void> {
      const ok = await repo.remove(trainerId, clientId, workoutId);
      if (!ok) throw notFound('Тренировка не найдена');
    },

    // Добавляет упражнение в конец тренировки. 404 (нет в паре) / 400 UNKNOWN_EXERCISE (невидимо).
    async addExercise(
      trainerId: string,
      clientId: string,
      workoutId: string,
      input: AddWorkoutExerciseRequest,
    ): Promise<WorkoutResponse> {
      // Сначала проверяем существование тренировки в паре (404), затем видимость (400).
      const existing = await repo.getFull(trainerId, clientId, workoutId);
      if (!existing) throw notFound('Тренировка не найдена');
      const visible = await repo.areExercisesVisible(trainerId, [input.exerciseId]);
      if (!visible) throw unknownExercise();

      const row = await repo.addExercise(trainerId, clientId, workoutId, toExerciseInput(input));
      if (!row) throw notFound('Тренировка не найдена');
      return toResponse(row);
    },

    // Удаляет упражнение на позиции pos; оставшиеся позиции перенумеровываются 0..n-1.
    async removeExercise(
      trainerId: string,
      clientId: string,
      workoutId: string,
      pos: number,
    ): Promise<WorkoutResponse> {
      const res = await repo.removeExercise(trainerId, clientId, workoutId, pos);
      if (res === null) throw notFound('Тренировка не найдена');
      if (res === 'not_found_pos') throw notFound('Упражнение не найдено');
      return toResponse(res);
    },

    // Переставляет упражнения согласно order (старые position в новом порядке).
    async reorderExercises(
      trainerId: string,
      clientId: string,
      workoutId: string,
      order: number[],
    ): Promise<WorkoutResponse> {
      const res = await repo.reorderExercises(trainerId, clientId, workoutId, order);
      if (res === null) throw notFound('Тренировка не найдена');
      if (res === 'bad_order')
        throw new AppError(400, 'BAD_ORDER', 'order должен быть перестановкой позиций упражнений');
      return toResponse(res);
    },
  };
}

export type ClientWorkoutsService = ReturnType<typeof makeClientWorkoutsService>;
