import { and, eq, gte, lte, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import {
  sessions,
  paymentPackages,
  clients,
  trainerClients,
  pushReminders,
} from '../../db/schema.js';

export type UpcomingSession = {
  id: string;
  trainerId: string;
  clientId: string;
  date: string;
  startTime: string;
  title: string | null;
  clientConfirmation: 'pending' | 'confirmed' | 'declined' | null;
};

export type ClientBalance = {
  trainerId: string;
  clientId: string;
  firstName: string;
  lastName: string;
  remaining: number;
};

export type BirthdayClient = {
  trainerId: string;
  clientId: string;
  firstName: string;
  lastName: string;
};

export function makeRemindersRepo(db: Db) {
  return {
    // Запись ключа дедупа. true — если вставили (значит, ещё не слали); false — уже было.
    async markIfNew(key: string, now: Date): Promise<boolean> {
      const res = await db
        .insert(pushReminders)
        .values({ key, createdAt: now })
        .onConflictDoNothing()
        .returning({ key: pushReminders.key });
      return res.length > 0;
    },

    // Запланированные занятия в диапазоне дат (точную 24ч-границу считает планировщик).
    async upcomingSessions(fromDate: string, toDate: string): Promise<UpcomingSession[]> {
      return db
        .select({
          id: sessions.id,
          trainerId: sessions.trainerId,
          clientId: sessions.clientId,
          date: sessions.date,
          startTime: sessions.startTime,
          title: sessions.title,
          clientConfirmation: sessions.clientConfirmation,
        })
        .from(sessions)
        .where(
          and(
            eq(sessions.status, 'planned'),
            gte(sessions.date, fromDate),
            lte(sessions.date, toDate),
          ),
        );
    },

    // Остаток по активным пакетам на клиента (+ имя). Для «пакет заканчивается» и «нет занятий».
    async clientBalances(): Promise<ClientBalance[]> {
      return db
        .select({
          trainerId: paymentPackages.trainerId,
          clientId: paymentPackages.clientId,
          firstName: clients.firstName,
          lastName: clients.lastName,
          remaining: sql<number>`coalesce(sum(${paymentPackages.lessonsPaid} - ${paymentPackages.lessonsUsed}), 0)::int`,
        })
        .from(paymentPackages)
        .innerJoin(clients, eq(clients.id, paymentPackages.clientId))
        .where(eq(paymentPackages.status, 'active'))
        .groupBy(
          paymentPackages.trainerId,
          paymentPackages.clientId,
          clients.firstName,
          clients.lastName,
        );
    },

    // Пары тренер↔клиент, у кого есть запланированное занятие в диапазоне (для «нет занятий»).
    async upcomingClientKeys(
      fromDate: string,
      toDate: string,
    ): Promise<{ trainerId: string; clientId: string }[]> {
      return db
        .selectDistinct({ trainerId: sessions.trainerId, clientId: sessions.clientId })
        .from(sessions)
        .where(
          and(
            eq(sessions.status, 'planned'),
            gte(sessions.date, fromDate),
            lte(sessions.date, toDate),
          ),
        );
    },

    // Активные клиенты с днём рождения сегодня (mmdd = 'MM-DD'), с их тренером.
    async birthdaysToday(mmdd: string): Promise<BirthdayClient[]> {
      return db
        .select({
          trainerId: trainerClients.trainerId,
          clientId: clients.id,
          firstName: clients.firstName,
          lastName: clients.lastName,
        })
        .from(clients)
        .innerJoin(
          trainerClients,
          and(eq(trainerClients.clientId, clients.id), eq(trainerClients.status, 'active')),
        )
        .where(sql`substring(${clients.birthDate} from 6 for 5) = ${mmdd}`);
    },
  };
}

export type RemindersRepo = ReturnType<typeof makeRemindersRepo>;
