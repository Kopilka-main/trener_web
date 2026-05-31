import { and, asc, eq, gte, lte } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { sessions, trainerClients } from '../../db/schema.js';
import type { SessionResponse, SessionStatus } from '@trener/shared';

export type SessionRow = {
  id: string;
  trainerId: string;
  clientId: string;
  workoutId: string | null;
  date: string;
  startTime: string;
  durationMin: number;
  location: string | null;
  title: string | null;
  status: SessionStatus;
  isOnline: number; // int 0/1 на границе БД
  note: string | null;
  createdAt: Date;
};

export type CreateSessionInput = {
  id: string;
  trainerId: string;
  clientId: string;
  date: string;
  startTime: string;
  durationMin: number;
  location?: string | null;
  title?: string | null;
  isOnline: boolean;
  workoutId?: string | null;
};

export type UpdateSessionInput = {
  clientId?: string;
  date?: string;
  startTime?: string;
  durationMin?: number;
  location?: string | null;
  title?: string | null;
  status?: SessionStatus;
  isOnline?: boolean;
  workoutId?: string | null;
};

export type ListRange = { from?: string; to?: string };

const cols = {
  id: sessions.id,
  trainerId: sessions.trainerId,
  clientId: sessions.clientId,
  workoutId: sessions.workoutId,
  date: sessions.date,
  startTime: sessions.startTime,
  durationMin: sessions.durationMin,
  location: sessions.location,
  title: sessions.title,
  status: sessions.status,
  isOnline: sessions.isOnline,
  note: sessions.note,
  createdAt: sessions.createdAt,
};

// Маппинг строки БД в ответ API. isOnline int→bool на границе repo.
export function toResponse(r: SessionRow): SessionResponse {
  return {
    id: r.id,
    clientId: r.clientId,
    workoutId: r.workoutId,
    date: r.date,
    startTime: r.startTime,
    durationMin: r.durationMin,
    location: r.location,
    title: r.title,
    status: r.status,
    isOnline: r.isOnline !== 0,
    note: r.note,
  };
}

export function makeSessionsRepo(db: Db) {
  // Проверка связи тренер↔клиент прямым запросом к trainer_clients
  // (чтобы не плодить зависимость от clients.repo в этом модуле).
  async function isClientLinked(trainerId: string, clientId: string): Promise<boolean> {
    const [row] = await db
      .select({ clientId: trainerClients.clientId })
      .from(trainerClients)
      .where(and(eq(trainerClients.trainerId, trainerId), eq(trainerClients.clientId, clientId)));
    return !!row;
  }

  // Занятие тренера или null (scoped по trainer_id).
  // Локальная функция, чтобы переиспользовать без проблем с `this`.
  async function getForTrainerLocal(trainerId: string, id: string): Promise<SessionRow | null> {
    const [row] = await db
      .select(cols)
      .from(sessions)
      .where(and(eq(sessions.id, id), eq(sessions.trainerId, trainerId)));
    return row ?? null;
  }

  return {
    isClientLinked,

    getForTrainer: getForTrainerLocal,

    // Создание занятия. Вызывающий (service) уже проверил связь клиента.
    async create(input: CreateSessionInput): Promise<SessionRow> {
      const [row] = await db
        .insert(sessions)
        .values({
          id: input.id,
          trainerId: input.trainerId,
          clientId: input.clientId,
          workoutId: input.workoutId ?? null,
          date: input.date,
          startTime: input.startTime,
          durationMin: input.durationMin,
          location: input.location ?? null,
          title: input.title ?? null,
          isOnline: input.isOnline ? 1 : 0,
        })
        .returning(cols);
      if (!row) throw new Error('insert failed');
      return row;
    },

    // Занятия тренера, опц. фильтр по диапазону дат [from..to], сорт по date, startTime.
    async listByTrainer(trainerId: string, range: ListRange = {}): Promise<SessionRow[]> {
      const conds = [eq(sessions.trainerId, trainerId)];
      if (range.from !== undefined) conds.push(gte(sessions.date, range.from));
      if (range.to !== undefined) conds.push(lte(sessions.date, range.to));
      return db
        .select(cols)
        .from(sessions)
        .where(and(...conds))
        .orderBy(asc(sessions.date), asc(sessions.startTime));
    },

    // Апдейт только своего занятия; вернуть строку или null. Связь clientId проверяет service.
    async update(
      trainerId: string,
      id: string,
      patch: UpdateSessionInput,
    ): Promise<SessionRow | null> {
      const set: Partial<{
        clientId: string;
        date: string;
        startTime: string;
        durationMin: number;
        location: string | null;
        title: string | null;
        status: SessionStatus;
        isOnline: number;
        workoutId: string | null;
      }> = {};
      if (patch.clientId !== undefined) set.clientId = patch.clientId;
      if (patch.date !== undefined) set.date = patch.date;
      if (patch.startTime !== undefined) set.startTime = patch.startTime;
      if (patch.durationMin !== undefined) set.durationMin = patch.durationMin;
      if (patch.location !== undefined) set.location = patch.location;
      if (patch.title !== undefined) set.title = patch.title;
      if (patch.status !== undefined) set.status = patch.status;
      if (patch.isOnline !== undefined) set.isOnline = patch.isOnline ? 1 : 0;
      if (patch.workoutId !== undefined) set.workoutId = patch.workoutId;

      if (Object.keys(set).length === 0) {
        // Пустой патч — вернуть текущее занятие, если оно своё.
        return getForTrainerLocal(trainerId, id);
      }

      const [row] = await db
        .update(sessions)
        .set(set)
        .where(and(eq(sessions.id, id), eq(sessions.trainerId, trainerId)))
        .returning(cols);
      return row ?? null;
    },

    // Удаление только своего занятия; boolean.
    async delete(trainerId: string, id: string): Promise<boolean> {
      const res = await db
        .delete(sessions)
        .where(and(eq(sessions.id, id), eq(sessions.trainerId, trainerId)))
        .returning({ id: sessions.id });
      return res.length > 0;
    },
  };
}

export type SessionsRepo = ReturnType<typeof makeSessionsRepo>;
