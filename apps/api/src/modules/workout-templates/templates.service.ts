import type {
  TemplatesRepo,
  TemplateRow,
  TemplateExerciseInput,
  UpdateTemplateInput,
} from './templates.repo.js';
import type {
  CreateTemplateRequest,
  TemplateExercise,
  TemplateResponse,
  UpdateTemplateRequest,
} from '@trener/shared';
import { AppError, notFound } from '../../errors.js';

export type TemplatesDeps = { newId: () => string };

const unknownExercise = () =>
  new AppError(400, 'UNKNOWN_EXERCISE', 'Упражнение недоступно тренеру');

const clientNotLinked = () => new AppError(400, 'CLIENT_NOT_LINKED', 'Клиент не связан с тренером');

function toResponse(r: TemplateRow): TemplateResponse {
  return {
    id: r.id,
    name: r.name,
    categoryTag: r.categoryTag,
    shortDescription: r.shortDescription,
    clientId: r.clientId,
    clientName: r.clientName,
    exercises: r.exercises.map((e) => ({
      position: e.position,
      exerciseId: e.exerciseId,
      exerciseName: e.exerciseName,
      sets: e.sets,
      reps: e.reps,
      weightKg: e.weightKg,
      timeSec: e.timeSec,
      restSec: e.restSec,
    })),
  };
}

// Контрактная позиция → вход repo (restSec в схеме всегда задан default(90)).
function toInput(e: TemplateExercise): TemplateExerciseInput {
  const item: TemplateExerciseInput = {
    exerciseId: e.exerciseId,
    sets: e.sets,
    restSec: e.restSec,
  };
  if (e.reps != null) item.reps = e.reps;
  if (e.weightKg != null) item.weightKg = e.weightKg;
  if (e.timeSec != null) item.timeSec = e.timeSec;
  return item;
}

export function makeTemplatesService(repo: TemplatesRepo, deps: TemplatesDeps) {
  return {
    async list(trainerId: string): Promise<TemplateResponse[]> {
      const rows = await repo.listByTrainer(trainerId);
      return rows.map(toResponse);
    },

    async get(trainerId: string, templateId: string): Promise<TemplateResponse> {
      const row = await repo.getForTrainer(trainerId, templateId);
      if (!row) throw notFound('Шаблон не найден');
      return toResponse(row);
    },

    async create(trainerId: string, input: CreateTemplateRequest): Promise<TemplateResponse> {
      // clientId задан → персональный шаблон: клиент обязан быть связан с тренером,
      // иначе 400 (не заводим шаблон под чужого клиента). Пустая строка ≡ общий шаблон.
      const clientId = input.clientId && input.clientId.length > 0 ? input.clientId : null;
      if (clientId !== null && !(await repo.isClientLinked(trainerId, clientId))) {
        throw clientNotLinked();
      }
      const row = await repo.create(trainerId, {
        id: deps.newId(),
        trainerId,
        clientId,
        name: input.name,
        categoryTag: input.categoryTag ?? null,
        shortDescription: input.shortDescription ?? null,
        exercises: input.exercises.map(toInput),
      });
      // null = одно из упражнений невидимо тренеру.
      if (!row) throw unknownExercise();
      return toResponse(row);
    },

    async update(
      trainerId: string,
      templateId: string,
      patch: UpdateTemplateRequest,
    ): Promise<TemplateResponse> {
      // exactOptionalPropertyTypes: задаём только определённые поля. clientId НЕ переносим:
      // scope шаблона (общий/персональный) неизменен — patch.clientId сознательно игнорируем.
      const repoPatch: UpdateTemplateInput = {};
      if (patch.name !== undefined) repoPatch.name = patch.name;
      if (patch.categoryTag !== undefined) repoPatch.categoryTag = patch.categoryTag ?? null;
      if (patch.shortDescription !== undefined)
        repoPatch.shortDescription = patch.shortDescription ?? null;
      if (patch.exercises !== undefined) repoPatch.exercises = patch.exercises.map(toInput);

      // repo.update вернёт null если: чужой/нет (→404) ИЛИ невидимое упражнение (→400).
      // Разводим причины: сначала проверяем существование шаблона у тренера.
      const exists = await repo.getForTrainer(trainerId, templateId);
      if (!exists) throw notFound('Шаблон не найден');

      const row = await repo.update(trainerId, templateId, repoPatch);
      if (!row) throw unknownExercise();
      return toResponse(row);
    },

    async remove(trainerId: string, templateId: string): Promise<void> {
      const ok = await repo.delete(trainerId, templateId);
      if (!ok) throw notFound('Шаблон не найден');
    },
  };
}

export type TemplatesService = ReturnType<typeof makeTemplatesService>;
