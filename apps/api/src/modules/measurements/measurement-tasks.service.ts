import type { MeasurementTasksRepo, MeasurementTaskRow } from './measurements.repo.js';
import type { CreateMeasurementTask, MeasurementTaskResponse } from '@trener/shared';
import { notFound } from '../../errors.js';

// Структурно совпадает с push PushPayload (не импортируем push-модуль из доменного слоя).
type TaskPushPayload = { title: string; body: string; url?: string };

export type MeasurementTasksDeps = {
  newId: () => string;
  now: () => Date;
  // Пуш клиенту о новой задаче на замеры (если задан).
  notifyClient?: (
    clientId: string,
    trainerId: string,
    build: (trainerName: string) => TaskPushPayload,
  ) => void;
};

function toResponse(r: MeasurementTaskRow): MeasurementTaskResponse {
  return {
    id: r.id,
    clientId: r.clientId,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
  };
}

export function makeMeasurementTasksService(
  repo: MeasurementTasksRepo,
  deps: MeasurementTasksDeps,
) {
  return {
    async create(
      trainerId: string,
      clientId: string,
      input: CreateMeasurementTask,
    ): Promise<MeasurementTaskResponse> {
      const row = await repo.create(trainerId, clientId, {
        id: deps.newId(),
        note: input.note ?? null,
        createdAt: deps.now(),
      });
      if (deps.notifyClient) {
        deps.notifyClient(clientId, trainerId, (trainerName) => ({
          title: trainerName,
          body: 'Просит сделать замеры',
          url: '/notifications',
        }));
      }
      return toResponse(row);
    },

    // Открытые задачи пары (для статуса у тренера и уведомлений у клиента).
    async listOpen(trainerId: string, clientId: string): Promise<MeasurementTaskResponse[]> {
      const rows = await repo.listOpenForClient(trainerId, clientId);
      return rows.map(toResponse);
    },

    // Тренер отменяет запрос замеров (разрешает задачу).
    async cancel(trainerId: string, clientId: string, taskId: string): Promise<void> {
      const ok = await repo.resolveOne(trainerId, clientId, taskId, deps.now());
      if (!ok) throw notFound('Задача не найдена');
    },

    // Закрыть все открытые задачи пары (вызывается при создании замера).
    async resolveOpen(trainerId: string, clientId: string): Promise<void> {
      await repo.resolveOpenForClient(trainerId, clientId, deps.now());
    },
  };
}

export type MeasurementTasksService = ReturnType<typeof makeMeasurementTasksService>;
