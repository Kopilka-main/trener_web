import type { SessionsRepo, UpdateSessionInput } from './sessions.repo.js';
import { toResponse } from './sessions.repo.js';
import type { CreateSessionRequest, SessionResponse, UpdateSessionRequest } from '@trener/shared';
import { AppError, notFound } from '../../errors.js';
import type { ListRange } from './sessions.repo.js';

export type SessionPushPayload = { title: string; body: string; url?: string };
export type SessionsDeps = {
  newId: () => string;
  // Тренер назначил занятие → пуш КЛИЕНТУ (build получает имя тренера). Fire-and-forget.
  notifyClientPending?: (
    clientId: string,
    trainerId: string,
    build: (trainerName: string) => SessionPushPayload,
  ) => void;
  // Клиент подтвердил/отклонил → пуш ТРЕНЕРУ (build получает имя клиента). Fire-and-forget.
  notifyTrainerConfirmation?: (
    trainerId: string,
    clientId: string,
    build: (clientName: string) => SessionPushPayload,
  ) => void;
};

const clientNotLinked = () => new AppError(400, 'CLIENT_NOT_LINKED', 'Клиент не связан с тренером');

const RU_MONTHS_SHORT = [
  'янв',
  'фев',
  'мар',
  'апр',
  'мая',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
];

// 'YYYY-MM-DD' + 'HH:MM' → '3 июн, 14:30' для текста пуша.
function formatWhen(date: string, time: string): string {
  const [, m, d] = date.split('-').map(Number);
  const mo = RU_MONTHS_SHORT[(m ?? 1) - 1] ?? '';
  return `${String(d ?? '')} ${mo}, ${time}`;
}

export function makeSessionsService(repo: SessionsRepo, deps: SessionsDeps) {
  return {
    async create(trainerId: string, input: CreateSessionRequest): Promise<SessionResponse> {
      if (!(await repo.isClientLinked(trainerId, input.clientId))) throw clientNotLinked();
      const row = await repo.create({
        id: deps.newId(),
        trainerId,
        clientId: input.clientId,
        date: input.date,
        startTime: input.startTime,
        durationMin: input.durationMin,
        location: input.location ?? null,
        title: input.title ?? null,
        isOnline: input.isOnline,
        workoutId: input.workoutId ?? null,
      });
      // Назначили занятие → клиенту пуш с просьбой подтвердить (с именем тренера).
      if (deps.notifyClientPending) {
        deps.notifyClientPending(input.clientId, trainerId, (trainerName) => ({
          title: 'Новое занятие',
          body: `${trainerName} назначил занятие ${formatWhen(input.date, input.startTime)} — подтвердите`,
          url: '/calendar',
        }));
      }
      return toResponse(row);
    },

    async list(trainerId: string, range: ListRange = {}): Promise<SessionResponse[]> {
      const rows = await repo.listByTrainer(trainerId, range);
      return rows.map(toResponse);
    },

    async get(trainerId: string, id: string): Promise<SessionResponse> {
      const row = await repo.getForTrainer(trainerId, id);
      if (!row) throw notFound('Занятие не найдено');
      return toResponse(row);
    },

    async update(
      trainerId: string,
      id: string,
      patch: UpdateSessionRequest,
    ): Promise<SessionResponse> {
      // При смене клиента — проверяем связь нового клиента с тренером.
      if (patch.clientId !== undefined && !(await repo.isClientLinked(trainerId, patch.clientId))) {
        throw clientNotLinked();
      }
      // exactOptionalPropertyTypes: задаём только определённые поля.
      const repoPatch: UpdateSessionInput = {};
      if (patch.clientId !== undefined) repoPatch.clientId = patch.clientId;
      if (patch.date !== undefined) repoPatch.date = patch.date;
      if (patch.startTime !== undefined) repoPatch.startTime = patch.startTime;
      if (patch.durationMin !== undefined) repoPatch.durationMin = patch.durationMin;
      if (patch.location !== undefined) repoPatch.location = patch.location ?? null;
      if (patch.title !== undefined) repoPatch.title = patch.title ?? null;
      if (patch.status !== undefined) repoPatch.status = patch.status;
      if (patch.isOnline !== undefined) repoPatch.isOnline = patch.isOnline;
      if (patch.workoutId !== undefined) repoPatch.workoutId = patch.workoutId ?? null;

      const row = await repo.update(trainerId, id, repoPatch);
      if (!row) throw notFound('Занятие не найдено');
      return toResponse(row);
    },

    async remove(trainerId: string, id: string): Promise<void> {
      const ok = await repo.delete(trainerId, id);
      if (!ok) throw notFound('Занятие не найдено');
    },

    async listForClient(
      trainerId: string,
      clientId: string,
      range: ListRange = {},
    ): Promise<SessionResponse[]> {
      const rows = await repo.listForClient(trainerId, clientId, range);
      return rows.map(toResponse);
    },

    async setClientConfirmation(
      trainerId: string,
      clientId: string,
      id: string,
      status: 'confirmed' | 'declined',
    ): Promise<SessionResponse> {
      // Уже согласованное занятие отклонить нельзя — подтверждение фиксируется.
      if (status === 'declined') {
        const current = await repo.getForTrainer(trainerId, id);
        if (!current) throw notFound('Занятие не найдено');
        if (current.clientConfirmation === 'confirmed') {
          throw new AppError(
            409,
            'ALREADY_CONFIRMED',
            'Занятие уже подтверждено — отклонить нельзя',
          );
        }
      }
      const row = await repo.setClientConfirmation(trainerId, clientId, id, status);
      if (!row) throw notFound('Занятие не найдено');
      const session = toResponse(row);
      // Клиент подтвердил/отклонил → тренеру пуш (с именем клиента).
      if (deps.notifyTrainerConfirmation) {
        const when = formatWhen(session.date, session.startTime);
        deps.notifyTrainerConfirmation(trainerId, clientId, (clientName) =>
          status === 'declined'
            ? {
                title: 'Занятие отклонено',
                body: `${clientName} отклонил занятие ${when} — согласуйте другое время`,
                url: `/clients/${clientId}/calendar`,
              }
            : {
                title: 'Занятие подтверждено',
                body: `${clientName} подтвердил занятие ${when}`,
                url: `/clients/${clientId}/calendar`,
              },
        );
      }
      return session;
    },
  };
}

export type SessionsService = ReturnType<typeof makeSessionsService>;
