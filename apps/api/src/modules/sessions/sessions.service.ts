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

const pad2 = (n: number): string => String(n).padStart(2, '0');
// Дата/время из момента завершения (локальное время сервера). Для корректных дат
// сервер должен идти в таймзоне тренера (или совпадать с ней).
function dateOf(d: Date): string {
  return `${String(d.getFullYear())}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function timeOf(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
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

    // Связать завершённую тренировку с календарём:
    //  • если уже привязано к этой тренировке — отметить проведённым и выйти;
    //  • если в этот день есть запланированное занятие — отметить самое раннее
    //    проведённым (+ инфо-пуш клиенту);
    //  • иначе создать проведённое занятие и попросить клиента согласовать (пуш).
    // Best-effort: вызывается после завершения тренировки, ошибки не роняют ответ.
    async reconcileFromWorkout(
      trainerId: string,
      clientId: string,
      workoutId: string,
      workoutName: string,
      completedAt: Date,
    ): Promise<void> {
      const linked = await repo.findByWorkoutId(trainerId, clientId, workoutId);
      if (linked) {
        if (linked.status !== 'completed') {
          await repo.update(trainerId, linked.id, { status: 'completed' });
        }
        return;
      }

      const date = dateOf(completedAt);
      const planned = await repo.findEarliestPlanned(trainerId, clientId, date);
      if (planned) {
        await repo.update(trainerId, planned.id, { status: 'completed', workoutId });
        if (deps.notifyClientPending) {
          deps.notifyClientPending(clientId, trainerId, (trainerName) => ({
            title: 'Тренировка проведена',
            body: `${trainerName} отметил занятие ${formatWhen(planned.date, planned.startTime)} как проведённое`,
            url: '/calendar',
          }));
        }
        return;
      }

      const startTime = timeOf(completedAt);
      await repo.createConducted({
        id: deps.newId(),
        trainerId,
        clientId,
        workoutId,
        date,
        startTime,
        title: workoutName,
      });
      if (deps.notifyClientPending) {
        deps.notifyClientPending(clientId, trainerId, (trainerName) => ({
          title: 'Подтвердите тренировку',
          body: `${trainerName} провёл тренировку ${formatWhen(date, startTime)} — согласуйте её`,
          url: '/calendar',
        }));
      }
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
      // Текущее состояние нужно, чтобы понять, переносится ли согласованное занятие.
      const current = await repo.getForTrainer(trainerId, id);
      if (!current) throw notFound('Занятие не найдено');

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

      // Перенос = изменилась дата, время начала или клиент. Если занятие уже было
      // согласовано клиентом — обнуляем согласование: прежняя договорённость
      // отменяется, клиент подтверждает новое время заново.
      const rescheduled =
        (patch.date !== undefined && patch.date !== current.date) ||
        (patch.startTime !== undefined && patch.startTime !== current.startTime) ||
        (patch.clientId !== undefined && patch.clientId !== current.clientId);
      const resetConfirmation = rescheduled && current.clientConfirmation === 'confirmed';
      if (resetConfirmation) repoPatch.clientConfirmation = 'pending';

      const row = await repo.update(trainerId, id, repoPatch);
      if (!row) throw notFound('Занятие не найдено');
      const session = toResponse(row);

      // Перенос согласованного → пуш клиенту: прежняя договорённость отменена,
      // нужно подтвердить новое время (адресат — текущий владелец занятия).
      if (resetConfirmation && deps.notifyClientPending) {
        const when = formatWhen(session.date, session.startTime);
        deps.notifyClientPending(session.clientId, trainerId, (trainerName) => ({
          title: 'Занятие перенесено',
          body: `${trainerName} перенёс занятие на ${when}. Прежняя договорённость отменена — подтвердите новое время`,
          url: '/calendar',
        }));
      }
      return session;
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
