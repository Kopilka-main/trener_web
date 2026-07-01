import { randomBytes } from 'node:crypto';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { clients, sessions, trainers } from '../../db/schema.js';

// Строка занятия для iCal-фида. isOnline — int 0/1 на границе БД (как в sessions).
export type FeedSessionRow = {
  id: string;
  date: string;
  startTime: string;
  durationMin: number;
  title: string | null;
  location: string | null;
  isOnline: number;
  clientName: string | null;
  status: string;
};

export function makeCalendarRepo(db: Db) {
  return {
    // Тренер по секретному токену фида или null (для резолва публичного .ics).
    async getTrainerIdByToken(token: string): Promise<string | null> {
      const [row] = await db
        .select({ id: trainers.id })
        .from(trainers)
        .where(eq(trainers.calendarToken, token));
      return row?.id ?? null;
    },

    // Токен фида тренера: если ещё нет — сгенерировать, сохранить и вернуть.
    async getOrCreateToken(trainerId: string): Promise<string> {
      const [existing] = await db
        .select({ token: trainers.calendarToken })
        .from(trainers)
        .where(eq(trainers.id, trainerId));
      if (existing?.token) return existing.token;

      const token = randomBytes(24).toString('hex');
      await db.update(trainers).set({ calendarToken: token }).where(eq(trainers.id, trainerId));
      return token;
    },

    // Занятия тренера для фида (кроме отменённых), с именем клиента (LEFT JOIN).
    // Скоуп по trainerId — фид отдаёт только занятия своего тренера.
    async listSessionsForFeed(trainerId: string): Promise<FeedSessionRow[]> {
      return db
        .select({
          id: sessions.id,
          date: sessions.date,
          startTime: sessions.startTime,
          durationMin: sessions.durationMin,
          title: sessions.title,
          location: sessions.location,
          isOnline: sessions.isOnline,
          clientName: sql<string | null>`${clients.firstName} || ' ' || ${clients.lastName}`,
          status: sessions.status,
        })
        .from(sessions)
        .leftJoin(clients, eq(sessions.clientId, clients.id))
        .where(and(eq(sessions.trainerId, trainerId), ne(sessions.status, 'cancelled')))
        .orderBy(asc(sessions.date), asc(sessions.startTime));
    },
  };
}

export type CalendarRepo = ReturnType<typeof makeCalendarRepo>;
