import { and, eq, gte, isNotNull, lte, ne, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import {
  sessions,
  paymentPackages,
  paymentInstallments,
  clients,
  clientAccounts,
  trainers,
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

// День рождения ТРЕНЕРА сегодня → его привязанный клиент (для пуша клиенту).
export type TrainerBirthday = {
  trainerId: string;
  clientId: string;
};

// Занятие в окне «через час» (+ флаг настройки клиента о напоминании).
export type WindowSession = {
  id: string;
  clientId: string;
  date: string;
  startTime: string;
  clientConfirmation: 'pending' | 'confirmed' | 'declined' | null;
  reminderEnabled: boolean;
};

// Платёж рассрочки с наступающей датой (для напоминания тренеру и клиенту).
export type InstallmentDue = {
  id: string;
  trainerId: string;
  clientId: string;
  firstName: string;
  lastName: string;
  amount: number;
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
      // Занятия без клиента (личные блоки) исключаем — некому слать напоминание.
      const rows = await db
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
            isNotNull(sessions.clientId),
          ),
        );
      return rows.flatMap((r) => (r.clientId === null ? [] : [{ ...r, clientId: r.clientId }]));
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
      const rows = await db
        .selectDistinct({ trainerId: sessions.trainerId, clientId: sessions.clientId })
        .from(sessions)
        .where(
          and(
            eq(sessions.status, 'planned'),
            gte(sessions.date, fromDate),
            lte(sessions.date, toDate),
            isNotNull(sessions.clientId),
          ),
        );
      return rows.flatMap((r) => (r.clientId === null ? [] : [{ ...r, clientId: r.clientId }]));
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

    // Тренеры с днём рождения сегодня (mmdd) и их привязанные (accountId != null)
    // активные клиенты — для пуша «день рождения тренера» каждому такому клиенту.
    async trainerBirthdaysToday(mmdd: string): Promise<TrainerBirthday[]> {
      const rows = await db
        .select({
          trainerId: trainerClients.trainerId,
          clientId: clients.id,
        })
        .from(trainers)
        .innerJoin(
          trainerClients,
          and(eq(trainerClients.trainerId, trainers.id), eq(trainerClients.status, 'active')),
        )
        .innerJoin(
          clients,
          and(eq(clients.id, trainerClients.clientId), isNotNull(clients.accountId)),
        )
        .where(sql`substring(${trainers.birthDate} from 6 for 5) = ${mmdd}`);
      return rows;
    },

    // Занятия в диапазоне дат (точное «через час»-окно считает планировщик),
    // с флагом настройки клиента о напоминании (join client_accounts по accountId).
    // Отменённые (status != planned) и без клиента исключаем.
    async sessionsInWindow(fromDate: string, toDate: string): Promise<WindowSession[]> {
      const rows = await db
        .select({
          id: sessions.id,
          clientId: sessions.clientId,
          date: sessions.date,
          startTime: sessions.startTime,
          clientConfirmation: sessions.clientConfirmation,
          // Настройка приходит из привязанного аккаунта; нет привязки → флаг null.
          reminderEnabled: clientAccounts.sessionReminderEnabled,
        })
        .from(sessions)
        .innerJoin(clients, eq(clients.id, sessions.clientId))
        .leftJoin(clientAccounts, eq(clientAccounts.id, clients.accountId))
        .where(
          and(
            eq(sessions.status, 'planned'),
            gte(sessions.date, fromDate),
            lte(sessions.date, toDate),
            isNotNull(sessions.clientId),
            ne(sessions.clientConfirmation, 'declined'),
          ),
        );
      return rows.flatMap((r) =>
        r.clientId === null
          ? []
          : [{ ...r, clientId: r.clientId, reminderEnabled: r.reminderEnabled ?? false }],
      );
    },

    // Платежи рассрочки со сроком на конкретную дату (pending), с тренером и именем
    // клиента — для напоминания «оплата завтра» тренеру и клиенту.
    async installmentsDueOn(date: string): Promise<InstallmentDue[]> {
      return db
        .select({
          id: paymentInstallments.id,
          trainerId: paymentInstallments.trainerId,
          clientId: paymentInstallments.clientId,
          firstName: clients.firstName,
          lastName: clients.lastName,
          amount: paymentInstallments.amount,
        })
        .from(paymentInstallments)
        .innerJoin(clients, eq(clients.id, paymentInstallments.clientId))
        .where(
          and(eq(paymentInstallments.status, 'pending'), eq(paymentInstallments.dueDate, date)),
        );
    },
  };
}

export type RemindersRepo = ReturnType<typeof makeRemindersRepo>;
