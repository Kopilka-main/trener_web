import type {
  PackagesRepo,
  PackageRow,
  CreatePackageInput,
  PackagePatchInput,
} from './packages.repo.js';
import type { CreatePackageRequest, UpdatePackageRequest, PackageResponse } from '@trener/shared';
import { notFound } from '../../errors.js';

export type PackagesDeps = { newId: () => string };

function toResponse(r: PackageRow): PackageResponse {
  return {
    id: r.id,
    clientId: r.clientId,
    lessonsPaid: r.lessonsPaid,
    lessonsUsed: r.lessonsUsed,
    pricePerLesson: r.pricePerLesson,
    totalPaid: r.totalPaid,
    workoutType: r.workoutType,
    startsAt: r.startsAt,
    status: r.status,
    note: r.note,
    tags: r.tags,
    createdAt: r.createdAt.toISOString(),
  };
}

export function makePackagesService(repo: PackagesRepo, deps: PackagesDeps) {
  return {
    async create(
      trainerId: string,
      clientId: string,
      input: CreatePackageRequest,
    ): Promise<PackageResponse> {
      // exactOptionalPropertyTypes: только заданные nullish-поля.
      const data: CreatePackageInput = {
        id: deps.newId(),
        lessonsPaid: input.lessonsPaid,
        pricePerLesson: input.pricePerLesson,
        totalPaid: input.totalPaid,
        startsAt: input.startsAt,
      };
      if (input.workoutType !== undefined) data.workoutType = input.workoutType ?? null;
      if (input.note !== undefined) data.note = input.note ?? null;
      if (input.tags !== undefined) data.tags = input.tags;

      const row = await repo.create(trainerId, clientId, data);
      return toResponse(row);
    },

    async list(trainerId: string, clientId: string): Promise<PackageResponse[]> {
      const rows = await repo.listForClient(trainerId, clientId);
      return rows.map(toResponse);
    },

    // Остатки оплаченных тренировок по клиентам тренера (активные пакеты).
    async listBalances(trainerId: string): Promise<{ clientId: string; remaining: number }[]> {
      return repo.activeBalancesForTrainer(trainerId);
    },

    async get(trainerId: string, clientId: string, packageId: string): Promise<PackageResponse> {
      const row = await repo.getForTrainer(trainerId, clientId, packageId);
      if (!row) throw notFound('Пакет не найден');
      return toResponse(row);
    },

    async update(
      trainerId: string,
      clientId: string,
      packageId: string,
      input: UpdatePackageRequest,
    ): Promise<PackageResponse> {
      const patch: PackagePatchInput = {};
      if (input.lessonsPaid !== undefined) patch.lessonsPaid = input.lessonsPaid;
      if (input.lessonsUsed !== undefined) patch.lessonsUsed = input.lessonsUsed;
      if (input.pricePerLesson !== undefined) patch.pricePerLesson = input.pricePerLesson;
      if (input.totalPaid !== undefined) patch.totalPaid = input.totalPaid;
      if (input.workoutType !== undefined) patch.workoutType = input.workoutType ?? null;
      if (input.startsAt !== undefined) patch.startsAt = input.startsAt;
      if (input.status !== undefined) patch.status = input.status;
      if (input.note !== undefined) patch.note = input.note ?? null;
      if (input.tags !== undefined) patch.tags = input.tags;

      const row = await repo.update(trainerId, clientId, packageId, patch);
      if (!row) throw notFound('Пакет не найден');
      return toResponse(row);
    },

    async remove(trainerId: string, clientId: string, packageId: string): Promise<void> {
      const ok = await repo.remove(trainerId, clientId, packageId);
      if (!ok) throw notFound('Пакет не найден');
    },
  };
}

export type PackagesService = ReturnType<typeof makePackagesService>;
