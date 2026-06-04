import type {
  ClientTemplateResponse,
  SaveClientTemplateRequest,
  WorkoutExercisePlan,
} from '@trener/shared';
import type { ClientTemplatesRepo, ClientTemplateRow } from './client-app-templates.repo.js';

export type ClientTemplatesDeps = { newId: () => string };

function toResponse(row: ClientTemplateRow): ClientTemplateResponse {
  return {
    id: row.id,
    name: row.name,
    exercises: row.exercises.map((ex) => ({
      exerciseId: ex.exerciseId,
      sets: ex.sets.map((s) => ({
        plannedReps: s.plannedReps ?? null,
        plannedWeightKg: s.plannedWeightKg ?? null,
        plannedTimeSec: s.plannedTimeSec ?? null,
        plannedRestSec: s.plannedRestSec ?? null,
      })),
    })),
    createdAt: row.createdAt.toISOString(),
  };
}

export function makeClientTemplatesService(repo: ClientTemplatesRepo, deps: ClientTemplatesDeps) {
  return {
    async list(trainerId: string, clientId: string): Promise<ClientTemplateResponse[]> {
      const rows = await repo.listForClient(trainerId, clientId);
      return rows.map(toResponse);
    },

    async save(
      trainerId: string,
      clientId: string,
      input: SaveClientTemplateRequest,
    ): Promise<ClientTemplateResponse> {
      const exercises = input.exercises.map((ex: WorkoutExercisePlan) => ({
        exerciseId: ex.exerciseId,
        sets: ex.sets.map((s) => ({
          plannedReps: s.plannedReps ?? null,
          plannedWeightKg: s.plannedWeightKg ?? null,
          plannedTimeSec: s.plannedTimeSec ?? null,
          plannedRestSec: s.plannedRestSec ?? null,
        })),
      }));
      const row = await repo.create({
        id: deps.newId(),
        trainerId,
        clientId,
        name: input.name,
        exercises,
      });
      return toResponse(row);
    },

    async remove(trainerId: string, clientId: string, id: string): Promise<boolean> {
      return repo.remove(trainerId, clientId, id);
    },
  };
}

export type ClientTemplatesService = ReturnType<typeof makeClientTemplatesService>;
