import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { clientWorkoutTemplates } from '../../db/schema.js';

export type TemplatePlanSet = {
  plannedReps?: number | null;
  plannedWeightKg?: number | null;
  plannedTimeSec?: number | null;
  plannedRestSec?: number | null;
};
export type TemplatePlanExercise = { exerciseId: string; sets: TemplatePlanSet[] };

export type ClientTemplateRow = {
  id: string;
  name: string;
  exercises: TemplatePlanExercise[];
  createdAt: Date;
};

const columns = {
  id: clientWorkoutTemplates.id,
  name: clientWorkoutTemplates.name,
  exercises: clientWorkoutTemplates.exercises,
  createdAt: clientWorkoutTemplates.createdAt,
};

// Репозиторий клиентских шаблонов: scoped по паре (тренер, клиент). HTTP-слой не импортирует.
export function makeClientTemplatesRepo(db: Db) {
  function pair(trainerId: string, clientId: string) {
    return and(
      eq(clientWorkoutTemplates.trainerId, trainerId),
      eq(clientWorkoutTemplates.clientId, clientId),
    );
  }

  return {
    async create(input: {
      id: string;
      trainerId: string;
      clientId: string;
      name: string;
      exercises: TemplatePlanExercise[];
    }): Promise<ClientTemplateRow> {
      const [row] = await db
        .insert(clientWorkoutTemplates)
        .values({
          id: input.id,
          trainerId: input.trainerId,
          clientId: input.clientId,
          name: input.name,
          exercises: input.exercises,
        })
        .returning(columns);
      return row!;
    },

    async listForClient(trainerId: string, clientId: string): Promise<ClientTemplateRow[]> {
      return db
        .select(columns)
        .from(clientWorkoutTemplates)
        .where(pair(trainerId, clientId))
        .orderBy(desc(clientWorkoutTemplates.createdAt));
    },

    async remove(trainerId: string, clientId: string, id: string): Promise<boolean> {
      const res = await db
        .delete(clientWorkoutTemplates)
        .where(and(eq(clientWorkoutTemplates.id, id), pair(trainerId, clientId)))
        .returning({ id: clientWorkoutTemplates.id });
      return res.length > 0;
    },
  };
}

export type ClientTemplatesRepo = ReturnType<typeof makeClientTemplatesRepo>;
