import type { ExercisesRepo, UpdateExerciseInput } from './exercises.repo.js';
import { toResponse } from './exercises.repo.js';
import type {
  CreateExerciseRequest,
  ExerciseResponse,
  UpdateExerciseRequest,
} from '@trener/shared';
import { AppError, notFound } from '../../errors.js';

export type ExercisesDeps = { newId: () => string };

export function makeExercisesService(repo: ExercisesRepo, deps: ExercisesDeps) {
  return {
    async list(trainerId: string): Promise<ExerciseResponse[]> {
      const rows = await repo.list(trainerId);
      return rows.map(toResponse);
    },

    async get(trainerId: string, id: string): Promise<ExerciseResponse> {
      const row = await repo.getVisible(trainerId, id);
      if (!row) throw notFound('Упражнение не найдено');
      return toResponse(row);
    },

    async create(trainerId: string, input: CreateExerciseRequest): Promise<ExerciseResponse> {
      // Вариант базового упражнения: переносим фото/видео и справочные поля каталога
      // из источника (если он виден тренеру — личный или глобальный).
      let media: {
        imageUrl: string | null;
        thumbUrl: string | null;
        videoUrl: string | null;
        equipment: string | null;
        primaryMuscles: string | null;
        secondaryMuscles: string | null;
      } | null = null;
      if (input.sourceExerciseId) {
        const src = await repo.getVisible(trainerId, input.sourceExerciseId);
        if (src) {
          media = {
            imageUrl: src.imageUrl,
            thumbUrl: src.thumbUrl,
            videoUrl: src.videoUrl,
            equipment: src.equipment,
            primaryMuscles: src.primaryMuscles,
            secondaryMuscles: src.secondaryMuscles,
          };
        }
      }
      const row = await repo.create({
        id: deps.newId(),
        trainerId,
        name: input.name,
        category: input.category,
        subgroup: input.subgroup ?? null,
        description: input.description ?? null,
        defaultReps: input.defaultReps ?? null,
        defaultWeightKg: input.defaultWeightKg ?? null,
        defaultTimeSec: input.defaultTimeSec ?? null,
        restSec: input.restSec,
        note: input.note ?? null,
        ...(media ?? {}),
      });
      return toResponse(row);
    },

    async update(
      trainerId: string,
      id: string,
      patch: UpdateExerciseRequest,
    ): Promise<ExerciseResponse> {
      // exactOptionalPropertyTypes: задаём только определённые поля.
      const repoPatch: UpdateExerciseInput = {};
      if (patch.name !== undefined) repoPatch.name = patch.name;
      if (patch.category !== undefined) repoPatch.category = patch.category;
      if (patch.subgroup !== undefined) repoPatch.subgroup = patch.subgroup ?? null;
      if (patch.description !== undefined) repoPatch.description = patch.description ?? null;
      if (patch.defaultReps !== undefined) repoPatch.defaultReps = patch.defaultReps ?? null;
      if (patch.defaultWeightKg !== undefined)
        repoPatch.defaultWeightKg = patch.defaultWeightKg ?? null;
      if (patch.defaultTimeSec !== undefined)
        repoPatch.defaultTimeSec = patch.defaultTimeSec ?? null;
      if (patch.restSec !== undefined) repoPatch.restSec = patch.restSec;
      if (patch.note !== undefined) repoPatch.note = patch.note ?? null;

      // repo.update вернёт null для глобальной/чужой/несуществующей → 404.
      const row = await repo.update(trainerId, id, repoPatch);
      if (!row) throw notFound('Упражнение не найдено');
      return toResponse(row);
    },

    async remove(trainerId: string, id: string): Promise<void> {
      const res = await repo.delete(trainerId, id);
      if (res === 'not_found') throw notFound('Упражнение не найдено');
      if (res === 'in_use')
        throw new AppError(
          409,
          'EXERCISE_IN_USE',
          'Упражнение используется в шаблоне или тренировке',
        );
    },
  };
}

export type ExercisesService = ReturnType<typeof makeExercisesService>;
