import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { measurements } from '../../db/schema.js';

export type MeasurementRow = {
  id: string;
  trainerId: string;
  clientId: string;
  date: string;
  weightKg: number | null;
  bodyFatPct: number | null;
  chestCm: number | null;
  waistCm: number | null;
  hipsCm: number | null;
  note: string | null;
  createdAt: Date;
};

export type CreateMeasurementInput = {
  id: string;
  date: string;
  weightKg?: number | null;
  bodyFatPct?: number | null;
  chestCm?: number | null;
  waistCm?: number | null;
  hipsCm?: number | null;
  note?: string | null;
};

export type MeasurementPatchInput = {
  date?: string;
  weightKg?: number | null;
  bodyFatPct?: number | null;
  chestCm?: number | null;
  waistCm?: number | null;
  hipsCm?: number | null;
  note?: string | null;
};

const columns = {
  id: measurements.id,
  trainerId: measurements.trainerId,
  clientId: measurements.clientId,
  date: measurements.date,
  weightKg: measurements.weightKg,
  bodyFatPct: measurements.bodyFatPct,
  chestCm: measurements.chestCm,
  waistCm: measurements.waistCm,
  hipsCm: measurements.hipsCm,
  note: measurements.note,
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
          chestCm: input.chestCm ?? null,
          waistCm: input.waistCm ?? null,
          hipsCm: input.hipsCm ?? null,
          note: input.note ?? null,
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
