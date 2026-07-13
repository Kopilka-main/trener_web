import type {
  MeasurementsRepo,
  MeasurementRow,
  CreateMeasurementInput,
  MeasurementPatchInput,
} from './measurements.repo.js';
import type {
  CreateMeasurementRequest,
  UpdateMeasurementRequest,
  MeasurementResponse,
} from '@trener/shared';
import { notFound } from '../../errors.js';

export type MeasurementsDeps = {
  newId: () => string;
  // Автор замера: true — добавил клиент (клиентский контур), false — тренер. По умолчанию false.
  createdByClient?: boolean;
  // Вызывается после успешного создания замера — закрыть открытые задачи на замеры пары.
  onMeasurementCreated?: (trainerId: string, clientId: string) => void | Promise<void>;
};

function toResponse(r: MeasurementRow): MeasurementResponse {
  return {
    id: r.id,
    clientId: r.clientId,
    date: r.date,
    weightKg: r.weightKg,
    skeletalMuscleKg: r.skeletalMuscleKg,
    bodyFatPct: r.bodyFatPct,
    bicepsCm: r.bicepsCm,
    chestCm: r.chestCm,
    underbustCm: r.underbustCm,
    waistCm: r.waistCm,
    bellyCm: r.bellyCm,
    glutesCm: r.glutesCm,
    hipsCm: r.hipsCm,
    thighCm: r.thighCm,
    calfCm: r.calfCm,
    note: r.note,
    createdByClient: r.createdByClient,
    createdAt: r.createdAt.toISOString(),
  };
}

export function makeMeasurementsService(repo: MeasurementsRepo, deps: MeasurementsDeps) {
  return {
    async create(
      trainerId: string,
      clientId: string,
      input: CreateMeasurementRequest,
    ): Promise<MeasurementResponse> {
      // exactOptionalPropertyTypes: только заданные nullish-поля.
      const data: CreateMeasurementInput = {
        id: deps.newId(),
        date: input.date,
        createdByClient: deps.createdByClient ?? false,
      };
      if (input.weightKg !== undefined) data.weightKg = input.weightKg ?? null;
      if (input.skeletalMuscleKg !== undefined)
        data.skeletalMuscleKg = input.skeletalMuscleKg ?? null;
      if (input.bodyFatPct !== undefined) data.bodyFatPct = input.bodyFatPct ?? null;
      if (input.bicepsCm !== undefined) data.bicepsCm = input.bicepsCm ?? null;
      if (input.chestCm !== undefined) data.chestCm = input.chestCm ?? null;
      if (input.underbustCm !== undefined) data.underbustCm = input.underbustCm ?? null;
      if (input.waistCm !== undefined) data.waistCm = input.waistCm ?? null;
      if (input.bellyCm !== undefined) data.bellyCm = input.bellyCm ?? null;
      if (input.glutesCm !== undefined) data.glutesCm = input.glutesCm ?? null;
      if (input.hipsCm !== undefined) data.hipsCm = input.hipsCm ?? null;
      if (input.thighCm !== undefined) data.thighCm = input.thighCm ?? null;
      if (input.calfCm !== undefined) data.calfCm = input.calfCm ?? null;
      if (input.note !== undefined) data.note = input.note ?? null;

      const row = await repo.create(trainerId, clientId, data);
      // Замер внесён → закрываем открытые задачи на замеры (если хук задан).
      if (deps.onMeasurementCreated) await deps.onMeasurementCreated(trainerId, clientId);
      return toResponse(row);
    },

    async list(trainerId: string, clientId: string): Promise<MeasurementResponse[]> {
      const rows = await repo.listForClient(trainerId, clientId);
      return rows.map(toResponse);
    },

    async get(
      trainerId: string,
      clientId: string,
      measurementId: string,
    ): Promise<MeasurementResponse> {
      const row = await repo.getForTrainer(trainerId, clientId, measurementId);
      if (!row) throw notFound('Замер не найден');
      return toResponse(row);
    },

    async update(
      trainerId: string,
      clientId: string,
      measurementId: string,
      input: UpdateMeasurementRequest,
    ): Promise<MeasurementResponse> {
      // Семантика: явный null очищает поле, отсутствие — не трогает.
      const patch: MeasurementPatchInput = {};
      if (input.date !== undefined) patch.date = input.date;
      if (input.weightKg !== undefined) patch.weightKg = input.weightKg ?? null;
      if (input.skeletalMuscleKg !== undefined)
        patch.skeletalMuscleKg = input.skeletalMuscleKg ?? null;
      if (input.bodyFatPct !== undefined) patch.bodyFatPct = input.bodyFatPct ?? null;
      if (input.bicepsCm !== undefined) patch.bicepsCm = input.bicepsCm ?? null;
      if (input.chestCm !== undefined) patch.chestCm = input.chestCm ?? null;
      if (input.underbustCm !== undefined) patch.underbustCm = input.underbustCm ?? null;
      if (input.waistCm !== undefined) patch.waistCm = input.waistCm ?? null;
      if (input.bellyCm !== undefined) patch.bellyCm = input.bellyCm ?? null;
      if (input.glutesCm !== undefined) patch.glutesCm = input.glutesCm ?? null;
      if (input.hipsCm !== undefined) patch.hipsCm = input.hipsCm ?? null;
      if (input.thighCm !== undefined) patch.thighCm = input.thighCm ?? null;
      if (input.calfCm !== undefined) patch.calfCm = input.calfCm ?? null;
      if (input.note !== undefined) patch.note = input.note ?? null;

      const row = await repo.update(trainerId, clientId, measurementId, patch);
      if (!row) throw notFound('Замер не найден');
      return toResponse(row);
    },

    async remove(trainerId: string, clientId: string, measurementId: string): Promise<void> {
      const ok = await repo.remove(trainerId, clientId, measurementId);
      if (!ok) throw notFound('Замер не найден');
    },
  };
}

export type MeasurementsService = ReturnType<typeof makeMeasurementsService>;
