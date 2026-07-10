import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { measurements, measurementTasks } from '../../db/schema.js';

export type MeasurementRow = {
  id: string;
  trainerId: string;
  clientId: string;
  date: string;
  weightKg: number | null;
  bodyFatPct: number | null;
  bicepsCm: number | null;
  chestCm: number | null;
  underbustCm: number | null;
  waistCm: number | null;
  bellyCm: number | null;
  glutesCm: number | null;
  hipsCm: number | null;
  thighCm: number | null;
  calfCm: number | null;
  note: string | null;
  createdByClient: boolean;
  createdAt: Date;
};

export type CreateMeasurementInput = {
  id: string;
  date: string;
  createdByClient: boolean;
  weightKg?: number | null;
  bodyFatPct?: number | null;
  bicepsCm?: number | null;
  chestCm?: number | null;
  underbustCm?: number | null;
  waistCm?: number | null;
  bellyCm?: number | null;
  glutesCm?: number | null;
  hipsCm?: number | null;
  thighCm?: number | null;
  calfCm?: number | null;
  note?: string | null;
};

export type MeasurementPatchInput = {
  date?: string;
  weightKg?: number | null;
  bodyFatPct?: number | null;
  bicepsCm?: number | null;
  chestCm?: number | null;
  underbustCm?: number | null;
  waistCm?: number | null;
  bellyCm?: number | null;
  glutesCm?: number | null;
  hipsCm?: number | null;
  thighCm?: number | null;
  calfCm?: number | null;
  note?: string | null;
};

const columns = {
  id: measurements.id,
  trainerId: measurements.trainerId,
  clientId: measurements.clientId,
  date: measurements.date,
  weightKg: measurements.weightKg,
  bodyFatPct: measurements.bodyFatPct,
  bicepsCm: measurements.bicepsCm,
  chestCm: measurements.chestCm,
  underbustCm: measurements.underbustCm,
  waistCm: measurements.waistCm,
  bellyCm: measurements.bellyCm,
  glutesCm: measurements.glutesCm,
  hipsCm: measurements.hipsCm,
  thighCm: measurements.thighCm,
  calfCm: measurements.calfCm,
  note: measurements.note,
  createdByClient: measurements.createdByClient,
  createdAt: measurements.createdAt,
};

// Репозиторий замеров тела: scoped по паре (тренер, клиент). HTTP-слой не импортирует.
export function makeMeasurementsRepo(db: Db) {
  function scope(trainerId: string, clientId: string, measurementId: string) {
    return and(
      eq(measurements.id, measurementId),
      eq(measurements.trainerId, trainerId),
      eq(measurements.clientId, clientId),
    );
  }

  return {
    async create(
      trainerId: string,
      clientId: string,
      input: CreateMeasurementInput,
    ): Promise<MeasurementRow> {
      const [row] = await db
        .insert(measurements)
        .values({
          id: input.id,
          trainerId,
          clientId,
          date: input.date,
          weightKg: input.weightKg ?? null,
          bodyFatPct: input.bodyFatPct ?? null,
          bicepsCm: input.bicepsCm ?? null,
          chestCm: input.chestCm ?? null,
          underbustCm: input.underbustCm ?? null,
          waistCm: input.waistCm ?? null,
          bellyCm: input.bellyCm ?? null,
          glutesCm: input.glutesCm ?? null,
          hipsCm: input.hipsCm ?? null,
          thighCm: input.thighCm ?? null,
          calfCm: input.calfCm ?? null,
          note: input.note ?? null,
          createdByClient: input.createdByClient,
        })
        .returning(columns);
      // returning по PK всегда возвращает строку.
      return row!;
    },

    // Замеры пары, отсортированные по дате (новые сверху).
    async listForClient(trainerId: string, clientId: string): Promise<MeasurementRow[]> {
      return db
        .select(columns)
        .from(measurements)
        .where(and(eq(measurements.trainerId, trainerId), eq(measurements.clientId, clientId)))
        .orderBy(desc(measurements.date));
    },

    // Замер в scope пары, либо null (нет в паре).
    async getForTrainer(
      trainerId: string,
      clientId: string,
      measurementId: string,
    ): Promise<MeasurementRow | null> {
      const [row] = await db
        .select(columns)
        .from(measurements)
        .where(scope(trainerId, clientId, measurementId));
      return row ?? null;
    },

    // Частичный апдейт только в scope пары; null если замер не найден или patch пуст и замера нет.
    async update(
      trainerId: string,
      clientId: string,
      measurementId: string,
      patch: MeasurementPatchInput,
    ): Promise<MeasurementRow | null> {
      if (Object.keys(patch).length === 0) {
        const [row] = await db
          .select(columns)
          .from(measurements)
          .where(scope(trainerId, clientId, measurementId));
        return row ?? null;
      }
      const [row] = await db
        .update(measurements)
        .set(patch)
        .where(scope(trainerId, clientId, measurementId))
        .returning(columns);
      return row ?? null;
    },

    async remove(trainerId: string, clientId: string, measurementId: string): Promise<boolean> {
      const res = await db
        .delete(measurements)
        .where(scope(trainerId, clientId, measurementId))
        .returning({ id: measurements.id });
      return res.length > 0;
    },
  };
}

export type MeasurementsRepo = ReturnType<typeof makeMeasurementsRepo>;

// ─── Задачи на замеры ──────────────────────────────────────────────────────────

export type MeasurementTaskRow = {
  id: string;
  trainerId: string;
  clientId: string;
  note: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
};

const taskColumns = {
  id: measurementTasks.id,
  trainerId: measurementTasks.trainerId,
  clientId: measurementTasks.clientId,
  note: measurementTasks.note,
  createdAt: measurementTasks.createdAt,
  resolvedAt: measurementTasks.resolvedAt,
};

// Репозиторий задач на замеры: scoped по паре (тренер, клиент). HTTP-слой не импортирует.
export function makeMeasurementTasksRepo(db: Db) {
  return {
    async create(
      trainerId: string,
      clientId: string,
      input: { id: string; note?: string | null; createdAt: Date },
    ): Promise<MeasurementTaskRow> {
      const [row] = await db
        .insert(measurementTasks)
        .values({
          id: input.id,
          trainerId,
          clientId,
          note: input.note ?? null,
          createdAt: input.createdAt,
        })
        .returning(taskColumns);
      return row!;
    },

    // Открытые (неразрешённые) задачи пары — новые сверху.
    async listOpenForClient(trainerId: string, clientId: string): Promise<MeasurementTaskRow[]> {
      return db
        .select(taskColumns)
        .from(measurementTasks)
        .where(
          and(
            eq(measurementTasks.trainerId, trainerId),
            eq(measurementTasks.clientId, clientId),
            isNull(measurementTasks.resolvedAt),
          ),
        )
        .orderBy(desc(measurementTasks.createdAt));
    },

    // Разрешить все открытые задачи пары (вызывается при создании замера). Возвращает число закрытых.
    async resolveOpenForClient(
      trainerId: string,
      clientId: string,
      resolvedAt: Date,
    ): Promise<number> {
      const res = await db
        .update(measurementTasks)
        .set({ resolvedAt })
        .where(
          and(
            eq(measurementTasks.trainerId, trainerId),
            eq(measurementTasks.clientId, clientId),
            isNull(measurementTasks.resolvedAt),
          ),
        )
        .returning({ id: measurementTasks.id });
      return res.length;
    },

    // Разрешить одну задачу в scope пары (тренер отменяет запрос). false если не найдена.
    async resolveOne(
      trainerId: string,
      clientId: string,
      taskId: string,
      resolvedAt: Date,
    ): Promise<boolean> {
      const res = await db
        .update(measurementTasks)
        .set({ resolvedAt })
        .where(
          and(
            eq(measurementTasks.id, taskId),
            eq(measurementTasks.trainerId, trainerId),
            eq(measurementTasks.clientId, clientId),
          ),
        )
        .returning({ id: measurementTasks.id });
      return res.length > 0;
    },
  };
}

export type MeasurementTasksRepo = ReturnType<typeof makeMeasurementTasksRepo>;
