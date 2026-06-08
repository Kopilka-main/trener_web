import { and, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { paymentPackages } from '../../db/schema.js';

export type PackageStatus = 'active' | 'closed' | 'cancelled';

export type PackageRow = {
  id: string;
  trainerId: string;
  clientId: string;
  kind: 'package' | 'subscription';
  lessonsPaid: number;
  lessonsUsed: number;
  pricePerLesson: number;
  totalPaid: number;
  workoutType: string | null;
  paidAt: string | null;
  startsAt: string;
  endsAt: string | null;
  status: PackageStatus;
  note: string | null;
  tags: string[];
  createdAt: Date;
};

export type CreatePackageInput = {
  id: string;
  kind: 'package' | 'subscription';
  lessonsPaid: number;
  pricePerLesson: number;
  totalPaid: number;
  workoutType?: string | null;
  paidAt?: string | null;
  startsAt: string;
  endsAt?: string | null;
  note?: string | null;
  tags?: string[];
};

export type PackagePatchInput = {
  lessonsPaid?: number;
  lessonsUsed?: number;
  pricePerLesson?: number;
  totalPaid?: number;
  workoutType?: string | null;
  startsAt?: string;
  status?: PackageStatus;
  note?: string | null;
  tags?: string[];
};

const columns = {
  id: paymentPackages.id,
  trainerId: paymentPackages.trainerId,
  clientId: paymentPackages.clientId,
  kind: paymentPackages.kind,
  lessonsPaid: paymentPackages.lessonsPaid,
  lessonsUsed: paymentPackages.lessonsUsed,
  pricePerLesson: paymentPackages.pricePerLesson,
  totalPaid: paymentPackages.totalPaid,
  workoutType: paymentPackages.workoutType,
  paidAt: paymentPackages.paidAt,
  startsAt: paymentPackages.startsAt,
  endsAt: paymentPackages.endsAt,
  status: paymentPackages.status,
  note: paymentPackages.note,
  tags: paymentPackages.tags,
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
          kind: input.kind,
          lessonsPaid: input.lessonsPaid,
          lessonsUsed: 0,
          pricePerLesson: input.pricePerLesson,
          totalPaid: input.totalPaid,
          workoutType: input.workoutType ?? null,
          paidAt: input.paidAt ?? null,
          startsAt: input.startsAt,
          endsAt: input.endsAt ?? null,
          note: input.note ?? null,
          tags: input.tags ?? [],
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

    // Остаток оплаченных тренировок по клиентам (только активные пакеты):
    // Σ(lessonsPaid − lessonsUsed), сгруппировано по клиенту.
    async activeBalancesForTrainer(
      trainerId: string,
    ): Promise<{ clientId: string; remaining: number }[]> {
      return db
        .select({
          clientId: paymentPackages.clientId,
          remaining: sql<number>`coalesce(sum(${paymentPackages.lessonsPaid} - ${paymentPackages.lessonsUsed}), 0)::int`,
        })
        .from(paymentPackages)
        .where(and(eq(paymentPackages.trainerId, trainerId), eq(paymentPackages.status, 'active')))
        .groupBy(paymentPackages.clientId);
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
