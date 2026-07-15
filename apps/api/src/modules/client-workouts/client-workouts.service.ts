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
  AddWorkoutSetRequest,
  WorkoutResponse,
  ImportWorkoutRequest,
} from '@trener/shared';
import { AppError, notFound } from '../../errors.js';

export type ClientWorkoutsDeps = {
  newId: () => string;
  now: () => Date;
  // Тренер назначил тренировку → пуш КЛИЕНТУ (build получает имя тренера). Fire-and-forget.
  notify?: (
    clientId: string,
    trainerId: string,
    build: (trainerName: string) => { title: string; body: string; url?: string },
  ) => void;
  // Тренировка завершена → связать с календарём (отметить занятие проведённым или
  // создать его и попросить клиента согласовать). Best-effort.
  onCompleted?: (
    trainerId: string,
    clientId: string,
    workoutId: string,
    workoutName: string,
    completedAt: Date,
    tzOffsetMinutes?: number,
  ) => Promise<void> | void;
};

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
    createdByClient: r.createdByClient,
    excludedFromBalance: r.excludedFromBalance,
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
      createdByClient = false,
    ): Promise<WorkoutResponse> {
      // Историческую запись формирует только тренер; для клиентских — всегда false.
      const excludedFromBalance = !createdByClient && input.excludedFromBalance === true;
      const plan = {
        id: deps.newId(),
        name: input.name,
        sourceTemplateId: input.sourceTemplateId ?? null,
        exercises: input.exercises.map(toExerciseInput),
        excludedFromBalance,
      };
      const row = await repo.create(trainerId, clientId, plan, createdByClient);
      // null = одно из упражнений невидимо тренеру.
      if (!row) throw unknownExercise();
      // Назначил тренер (не сам клиент) → пуш клиенту с именем тренера. Историческую
      // запись клиенту не анонсируем (это фиксация уже проведённой тренировки).
      if (!createdByClient && !excludedFromBalance && deps.notify) {
        deps.notify(clientId, trainerId, (trainerName) => ({
          title: 'Новая тренировка',
          body: `${trainerName} добавил тренировку: ${input.name}`,
          url: '/workouts',
        }));
      }
      return toResponse(row);
    },

    // Импорт офлайн-проведённой тренировки. Идемпотентно по input.idempotencyKey:
    // повторная отправка возвращает существующую запись и НЕ повторяет побочки.
    async import(
      trainerId: string,
      clientId: string,
      input: ImportWorkoutRequest,
    ): Promise<WorkoutResponse> {
      const res = await repo.importWithKey(trainerId, clientId, deps.newId(), input);
      if (!res) throw unknownExercise();
      // Побочки завершения — только для НОВОЙ, проведённой (completed) и учитываемой
      // в балансе записи. Повтор (created=false) и historical/skipped — без побочек.
      if (
        res.created &&
        res.row.status === 'completed' &&
        !res.row.excludedFromBalance &&
        deps.onCompleted
      ) {
        const completedAt = res.row.completedAt ?? deps.now();
        // Связка с календарём (best-effort): не роняем импорт при ошибке — запись уже
        // создана, повторная отправка с тем же ключом ничего не воссоздаст.
        try {
          await deps.onCompleted(
            trainerId,
            clientId,
            res.row.id,
            res.row.name,
            completedAt,
            input.tzOffsetMinutes ?? undefined,
          );
        } catch {
          // отметка/создание занятия — побочный эффект, ошибка не критична
        }
      }
      return toResponse(res.row);
    },

    async list(
      trainerId: string,
      clientId: string,
      owner: 'trainer' | 'all' = 'all',
    ): Promise<WorkoutResponse[]> {
      const rows = await repo.listForClient(trainerId, clientId, owner);
      return rows.map(toResponse);
    },

    async get(trainerId: string, clientId: string, workoutId: string): Promise<WorkoutResponse> {
      const row = await repo.getFull(trainerId, clientId, workoutId);
      if (!row) throw notFound('Тренировка не найдена');
      return toResponse(row);
    },

    // draft → active атомарно. 404 (нет в паре) / 409 BAD_STATUS (не из черновика).
    async start(
      trainerId: string,
      clientId: string,
      workoutId: string,
      opts: { ownedByClientOnly?: boolean } = {},
    ): Promise<WorkoutResponse> {
      const res = await repo.setStatusActive(
        trainerId,
        clientId,
        workoutId,
        deps.now(),
        opts.ownedByClientOnly ?? false,
      );
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
      opts: { ownedByClientOnly?: boolean } = {},
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
        opts.ownedByClientOnly ?? false,
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
      opts: { ownedByClientOnly?: boolean } = {},
    ): Promise<WorkoutResponse> {
      const repoInput: CompleteInput = {};
      if (input.durationSec !== undefined) repoInput.durationSec = input.durationSec ?? null;
      if (input.trainerNote !== undefined) repoInput.trainerNote = input.trainerNote ?? null;
      if (input.rpe !== undefined) repoInput.rpe = input.rpe ?? null;

      const res = await repo.complete(
        trainerId,
        clientId,
        workoutId,
        repoInput,
        deps.now(),
        opts.ownedByClientOnly ?? false,
      );
      if (res === 'not_found') throw notFound('Тренировка не найдена');
      if (res === 'bad_status') throw badStatus('Завершить можно только активную тренировку');
      const updated = await repo.getFull(trainerId, clientId, workoutId);
      if (!updated) throw notFound('Тренировка не найдена');
      // Связка с календарём (best-effort): не роняем завершение при ошибке.
      if (deps.onCompleted) {
        try {
          await deps.onCompleted(
            trainerId,
            clientId,
            workoutId,
            updated.name,
            updated.completedAt ?? deps.now(),
            input.tzOffsetMinutes ?? undefined,
          );
        } catch {
          // отметка/создание занятия — побочный эффект, ошибка не критична
        }
      }
      return toResponse(updated);
    },

    // Зафиксировать черновик/активную тренировку как историческую запись указанной
    // датой (YYYY-MM-DD). НЕ вызывает onCompleted → не попадает в календарь, не влияет
    // на баланс пакета (excluded_from_balance=true). 404 / 409 BAD_STATUS.
    async addToHistory(
      trainerId: string,
      clientId: string,
      workoutId: string,
      date: string,
    ): Promise<WorkoutResponse> {
      // Полдень UTC: дата-часть (slice 0..10) совпадает с указанной во всех таймзонах.
      const completedAt = new Date(`${date}T12:00:00.000Z`);
      const res = await repo.addToHistory(trainerId, clientId, workoutId, completedAt);
      if (res === 'not_found') throw notFound('Тренировка не найдена');
      if (res === 'bad_status') throw badStatus('Эту тренировку нельзя добавить в историю');
      const updated = await repo.getFull(trainerId, clientId, workoutId);
      if (!updated) throw notFound('Тренировка не найдена');
      return toResponse(updated);
    },

    async remove(
      trainerId: string,
      clientId: string,
      workoutId: string,
      opts: { ownedByClientOnly?: boolean } = {},
    ): Promise<void> {
      const ok = await repo.remove(trainerId, clientId, workoutId, opts.ownedByClientOnly ?? false);
      if (!ok) throw notFound('Тренировка не найдена');
    },

    // Добавляет упражнение в конец тренировки. 404 (нет в паре) / 400 UNKNOWN_EXERCISE (невидимо).
    async addExercise(
      trainerId: string,
      clientId: string,
      workoutId: string,
      input: AddWorkoutExerciseRequest,
      opts: { ownedByClientOnly?: boolean } = {},
    ): Promise<WorkoutResponse> {
      // Сначала проверяем существование тренировки в паре (404), затем видимость (400).
      const existing = await repo.getFull(trainerId, clientId, workoutId);
      const ownedByClientOnly = opts.ownedByClientOnly ?? false;
      if (!existing || (ownedByClientOnly && !existing.createdByClient))
        throw notFound('Тренировка не найдена');
      const visible = await repo.areExercisesVisible(trainerId, [input.exerciseId]);
      if (!visible) throw unknownExercise();

      const row = await repo.addExercise(
        trainerId,
        clientId,
        workoutId,
        toExerciseInput(input),
        ownedByClientOnly,
      );
      if (!row) throw notFound('Тренировка не найдена');
      return toResponse(row);
    },

    // Удаляет упражнение на позиции pos; оставшиеся позиции перенумеровываются 0..n-1.
    async removeExercise(
      trainerId: string,
      clientId: string,
      workoutId: string,
      pos: number,
      opts: { ownedByClientOnly?: boolean } = {},
    ): Promise<WorkoutResponse> {
      // Клиент правит только свои тренировки: тренерскую трогать нельзя (404).
      if (opts.ownedByClientOnly) {
        const existing = await repo.getFull(trainerId, clientId, workoutId);
        if (!existing || !existing.createdByClient) throw notFound('Тренировка не найдена');
      }
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
      opts: { ownedByClientOnly?: boolean } = {},
    ): Promise<WorkoutResponse> {
      // Клиент правит только свои тренировки: тренерскую трогать нельзя (404).
      if (opts.ownedByClientOnly) {
        const existing = await repo.getFull(trainerId, clientId, workoutId);
        if (!existing || !existing.createdByClient) throw notFound('Тренировка не найдена');
      }
      const res = await repo.reorderExercises(trainerId, clientId, workoutId, order);
      if (res === null) throw notFound('Тренировка не найдена');
      if (res === 'bad_order')
        throw new AppError(400, 'BAD_ORDER', 'order должен быть перестановкой позиций упражнений');
      return toResponse(res);
    },

    // Добавляет один подход В КОНЕЦ упражнения на позиции pos (следующий set_index).
    async addSet(
      trainerId: string,
      clientId: string,
      workoutId: string,
      pos: number,
      input: AddWorkoutSetRequest,
    ): Promise<WorkoutResponse> {
      const res = await repo.addSet(trainerId, clientId, workoutId, pos, {
        plannedReps: input.plannedReps ?? null,
        plannedWeightKg: input.plannedWeightKg ?? null,
        plannedTimeSec: input.plannedTimeSec ?? null,
        plannedRestSec: input.plannedRestSec ?? null,
      });
      if (res === null) throw notFound('Тренировка не найдена');
      if (res === 'not_found_pos') throw notFound('Упражнение не найдено');
      return toResponse(res);
    },

    // Удаляет подход (pos, idx). Удаление последнего подхода упражнения удаляет само
    // упражнение (repo перенумеровывает оставшиеся).
    async deleteSet(
      trainerId: string,
      clientId: string,
      workoutId: string,
      pos: number,
      idx: number,
    ): Promise<WorkoutResponse> {
      const res = await repo.deleteSet(trainerId, clientId, workoutId, pos, idx);
      if (res === null) throw notFound('Тренировка не найдена');
      if (res === 'not_found_pos') throw notFound('Упражнение не найдено');
      if (res === 'not_found_set') throw notFound('Подход не найден');
      return toResponse(res);
    },
  };
}

export type ClientWorkoutsService = ReturnType<typeof makeClientWorkoutsService>;
