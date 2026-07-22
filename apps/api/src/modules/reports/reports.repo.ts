import { and, gte, lt, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import {
  analyticsScreenEvents,
  clientAccounts,
  clientWorkouts,
  errorLogs,
  measurements,
  messages,
  paymentPackages,
  sessions,
  trainerClients,
  trainers,
} from '../../db/schema.js';
import type { ReportData, TotalRow } from './reports.format.js';

// Сводка по продукту за период [from, to).
//
// Именованные тренеры (email) попадают в блоки «лидеры / новые / синхронизация»:
// отчёт уходит в закрытую админ-группу владельца продукта. Данные КЛИЕНТОВ
// остаются только в агрегатах — их имён и почт в отчёте нет.
export function makeReportsRepo(db: Db) {
  return {
    async collect(from: Date, to: Date): Promise<ReportData> {
      const inPeriod = (col: Parameters<typeof gte>[0]) => and(gte(col, from), lt(col, to));

      // Накопительный итог: сколько всего на конец периода и сколько было на начало.
      // Один запрос на таблицу вместо двух — через FILTER. Имена таблицы/колонки
      // приходят литералами из кода ниже, даты — параметрами (не склейкой строк).
      const pair = async (table: string, tsCol: string): Promise<{ now: number; was: number }> => {
        const res = await db.execute<{ now: number; was: number }>(sql`
          select count(*) filter (where ${sql.raw(tsCol)} < ${to.toISOString()}::timestamptz)::int as now,
                 count(*) filter (where ${sql.raw(tsCol)} < ${from.toISOString()}::timestamptz)::int as was
            from ${sql.raw(table)}
        `);
        const r = (res as unknown as { now: number; was: number }[])[0];
        return { now: r?.now ?? 0, was: r?.was ?? 0 };
      };

      const [
        tTrainers,
        tClients,
        tAccounts,
        tWorkouts,
        tSessions,
        tMessages,
        newTrainersN,
        newClientsN,
        linked,
        activeTrainers,
        activeClients,
        workouts,
        sess,
        meas,
        msgs,
        pkgs,
        errs,
        topErrors,
        versions,
        screens,
        leaders,
        newTrainerRows,
        syncRows,
        platforms,
        avgSession,
      ] = await Promise.all([
        pair('trainers', 'created_at'),
        pair('clients', 'created_at'),
        pair('client_accounts', 'created_at'),
        pair('client_workouts', 'created_at'),
        pair('sessions', 'created_at'),
        pair('messages', 'created_at'),

        db
          .select({ n: sql<number>`count(*)::int` })
          .from(trainers)
          .where(inPeriod(trainers.createdAt)),
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(clientAccounts)
          .where(inPeriod(clientAccounts.createdAt)),
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(trainerClients)
          .where(sql`${trainerClients.status} = 'active'`),
        db
          .select({ n: sql<number>`count(distinct ${analyticsScreenEvents.subjectId})::int` })
          .from(analyticsScreenEvents)
          .where(
            and(
              inPeriod(analyticsScreenEvents.enteredAt),
              sql`${analyticsScreenEvents.subjectType} = 'trainer'`,
            ),
          ),
        db
          .select({ n: sql<number>`count(distinct ${analyticsScreenEvents.subjectId})::int` })
          .from(analyticsScreenEvents)
          .where(
            and(
              inPeriod(analyticsScreenEvents.enteredAt),
              sql`${analyticsScreenEvents.subjectType} = 'client'`,
            ),
          ),
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(clientWorkouts)
          .where(
            and(inPeriod(clientWorkouts.completedAt), sql`${clientWorkouts.status} = 'completed'`),
          ),
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(sessions)
          .where(inPeriod(sessions.createdAt)),
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(measurements)
          .where(inPeriod(measurements.createdAt)),
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(messages)
          .where(inPeriod(messages.createdAt)),
        db
          .select({
            n: sql<number>`count(*)::int`,
            sum: sql<number>`coalesce(sum(${paymentPackages.totalPaid}), 0)::float8`,
          })
          .from(paymentPackages)
          .where(inPeriod(paymentPackages.createdAt)),
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(errorLogs)
          .where(inPeriod(errorLogs.ts)),
        db
          .select({ message: errorLogs.message, n: sql<number>`count(*)::int` })
          .from(errorLogs)
          .where(inPeriod(errorLogs.ts))
          .groupBy(errorLogs.message)
          .orderBy(sql`count(*) desc`)
          .limit(3),
        db
          .select({
            version: sql<string>`coalesce(${analyticsScreenEvents.appVersion}, '—')`,
            platform: sql<string>`coalesce(${analyticsScreenEvents.platform}, '—')`,
            users: sql<number>`count(distinct ${analyticsScreenEvents.subjectId})::int`,
          })
          .from(analyticsScreenEvents)
          .where(inPeriod(analyticsScreenEvents.enteredAt))
          .groupBy(analyticsScreenEvents.appVersion, analyticsScreenEvents.platform)
          .orderBy(sql`count(distinct ${analyticsScreenEvents.subjectId}) desc`)
          .limit(5),
        db
          .select({
            screen: analyticsScreenEvents.screen,
            minutes: sql<number>`(coalesce(sum(${analyticsScreenEvents.durationSec}), 0) / 60)::int`,
            opens: sql<number>`count(*)::int`,
          })
          .from(analyticsScreenEvents)
          .where(inPeriod(analyticsScreenEvents.enteredAt))
          .groupBy(analyticsScreenEvents.screen)
          .orderBy(sql`sum(${analyticsScreenEvents.durationSec}) desc`)
          .limit(5),

        // Топ тренеров по числу активных клиентов.
        db.execute<{ name: string; n: number }>(sql`
          select t.email as name, count(*)::int as n
            from trainer_clients tc
            join trainers t on t.id = tc.trainer_id
           where tc.status = 'active'
           group by t.email
           order by n desc
           limit 5
        `),
        // Новые тренеры за период + способ входа (oauth-провайдер либо email).
        db.execute<{ name: string; via: string }>(sql`
          select t.email as name, coalesce(o.provider, 'email') as via
            from trainers t
            left join oauth_accounts o on o.trainer_id = t.id
           where t.created_at >= ${from.toISOString()}::timestamptz
             and t.created_at <  ${to.toISOString()}::timestamptz
           order by t.created_at
           limit 10
        `),
        // Подключение клиентского приложения: связано / всего карточек у тренера.
        db.execute<{ name: string; linked: number; total: number }>(sql`
          select t.email as name,
                 count(*) filter (where c.account_id is not null)::int as linked,
                 count(*)::int as total
            from trainer_clients tc
            join trainers t on t.id = tc.trainer_id
            join clients  c on c.id = tc.client_id
           where tc.status = 'active'
           group by t.email
          having count(*) filter (where c.account_id is not null) > 0
           order by linked desc
           limit 5
        `),
        db
          .select({
            platform: sql<string>`coalesce(${analyticsScreenEvents.platform}, '—')`,
            users: sql<number>`count(distinct ${analyticsScreenEvents.subjectId})::int`,
          })
          .from(analyticsScreenEvents)
          .where(inPeriod(analyticsScreenEvents.enteredAt))
          .groupBy(analyticsScreenEvents.platform)
          .orderBy(sql`count(distinct ${analyticsScreenEvents.subjectId}) desc`),
        // Средняя сессия в минутах: суммарное время / число сессий.
        db
          .select({
            m: sql<number>`coalesce(sum(${analyticsScreenEvents.durationSec})::float8 / nullif(count(distinct ${analyticsScreenEvents.sessionId}), 0) / 60, 0)`,
          })
          .from(analyticsScreenEvents)
          .where(inPeriod(analyticsScreenEvents.enteredAt)),
      ]);

      const one = (rows: { n: number }[]): number => rows[0]?.n ?? 0;
      const rowsOf = <T>(r: unknown): T[] => r as T[];

      const totals: TotalRow[] = [
        { label: 'Тренеры', ...tTrainers },
        { label: 'Карточки клиентов', ...tClients },
        { label: 'Клиент-аккаунты', ...tAccounts },
        { label: 'Тренировки', ...tWorkouts },
        { label: 'Занятия', ...tSessions },
        { label: 'Сообщения', ...tMessages },
      ];

      return {
        totals,
        growth: {
          newTrainers: one(newTrainersN),
          newClientAccounts: one(newClientsN),
          activeTrainers: one(activeTrainers),
          activeClients: one(activeClients),
          linkedPairs: one(linked),
        },
        business: {
          workoutsCompleted: one(workouts),
          sessionsCreated: one(sess),
          measurements: one(meas),
          messages: one(msgs),
          packages: one(pkgs),
          packagesSum: pkgs[0]?.sum ?? 0,
        },
        leaders: rowsOf<{ name: string; n: number }>(leaders).map((r) => ({
          name: r.name,
          clients: r.n,
        })),
        newTrainers: rowsOf<{ name: string; via: string }>(newTrainerRows).map((r) => ({
          name: r.name,
          via: r.via,
        })),
        sync: rowsOf<{ name: string; linked: number; total: number }>(syncRows).map((r) => ({
          name: r.name,
          linked: r.linked,
          total: r.total,
        })),
        audience: {
          platforms: platforms.map((p) => ({ platform: p.platform, users: p.users })),
          avgSessionMin: avgSession[0]?.m ?? 0,
        },
        health: {
          errors: one(errs),
          topErrors: topErrors.map((r) => ({ message: r.message ?? '—', count: r.n })),
          versions: versions.map((r) => ({
            version: r.version,
            platform: r.platform,
            users: r.users,
          })),
        },
        screens: screens.map((r) => ({ screen: r.screen, minutes: r.minutes, opens: r.opens })),
      };
    },
  };
}

export type ReportsRepo = ReturnType<typeof makeReportsRepo>;
