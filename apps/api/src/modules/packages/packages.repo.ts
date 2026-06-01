import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { paymentPackages } from '../../db/schema.js';

export type PackageStatus = 'active' | 'closed' | 'cancelled';

export type PackageRow = {
  id: string;
  trainerId: string;
  clientId: string;
  lessonsPaid: number;
  pricePerLesson: number;
  totalPaid: number;
  workoutType: string | null;
  startsAt: string;
  status: PackageStatus;
  note: string | null;
  createdAt: Date;
};

export type CreatePackageInput = {
  id: string;
  lessonsPaid: number;
  pricePerLesson: number;
  totalPaid: number;
  workoutType?: string | null;
  startsAt: string;
  note?: string | null;
};

export type PackagePatchInput = {
  lessonsPaid?: number;
  pricePerLesson?: number;
  totalPaid?: number;
  workoutType?: string | null;
  startsAt?: string;
  status?: PackageStatus;
  note?: string | null;
};

const columns = {
  id: paymentPackages.id,
  trainerId: paymentPackages.trainerId,
  clientId: paymentPackages.clientId,
  lessonsPaid: paymentPackages.lessonsPaid,
  pricePerLesson: paymentPackages.pricePerLesson,
  totalPaid: paymentPackages.totalPaid,
  workoutType: paymentPackages.workoutType,
  startsAt: paymentPackages.startsAt,
  status: paymentPackages.status,
  note: paymentPackages.note,
  createdAt: paymentPackages.createdAt,
};

// Репозиторий пакетов оплат: scoped по паре (тренер, клиент). HTTP-слой не импортирует.
export function makePackagesRepo(db: Db) {
  function scope(trainerId: string, clientId: string, packageId: string) {
    return and(
      eq(paymentPackages.id, packageId),
      eq(paymentPackages.trainerId, trainerId),
      eq(paymentPackages.clientId, clientId),
    );
  }

  return {
    async create(
      trainerId: string,
      clientId: string,
      input: CreatePackageInput,
    ): Promise<PackageRow> {
      const [row] = await db
        .insert(paymentPackages)
        .values({
          id: input.id,
          trainerId,
          clientId,
          lessonsPaid: input.lessonsPaid,
          pricePerLesson: input.pricePerLesson,
          totalPaid: input.totalPaid,
          workoutType: input.workoutType ?? null,
          startsAt: input.startsAt,
          note: input.note ?? null,
        })
        .returning(columns);
      // returning по PK всегда возвращает строку.
      return row!;
    },

    async listForClient(trainerId: string, clientId: string): Promise<PackageRow[]> {
      return db
        .select(columns)
        .from(paymentPackages)
        .where(
          and(eq(paymentPackages.trainerId, trainerId), eq(paymentPackages.clientId, clientId)),
        )
        .orderBy(desc(paymentPackages.createdAt));
    },

    // Пакет в scope пары, либо null (нет в паре).
    async getForTrainer(
      trainerId: string,
      clientId: string,
      packageId: string,
    ): Promise<PackageRow | null> {
      const [row] = await db
        .select(columns)
        .from(paymentPackages)
        .where(scope(trainerId, clientId, packageId));
      return row ?? null;
    },

    // Частичный апдейт только в scope пары; null если пакет не найден или patch пуст и пакета нет.
    async update(
      trainerId: string,
      clientId: string,
      packageId: string,
      patch: PackagePatchInput,
    ): Promise<PackageRow | null> {
      if (Object.keys(patch).length === 0) {
        const [row] = await db
          .select(columns)
          .from(paymentPackages)
          .where(scope(trainerId, clientId, packageId));
        return row ?? null;
      }
      const [row] = await db
        .update(paymentPackages)
        .set(patch)
        .where(scope(trainerId, clientId, packageId))
        .returning(columns);
      return row ?? null;
    },

    async remove(trainerId: string, clientId: string, packageId: string): Promise<boolean> {
      const res = await db
        .delete(paymentPackages)
        .where(scope(trainerId, clientId, packageId))
        .returning({ id: paymentPackages.id });
      return res.length > 0;
    },
  };
}

export type PackagesRepo = ReturnType<typeof makePackagesRepo>;
