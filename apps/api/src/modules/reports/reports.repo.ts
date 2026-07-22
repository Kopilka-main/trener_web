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
import type { ReportData } from './reports.format.js';

// Сводка по продукту за период [from, to). Все запросы — только чтение и только
// агрегаты: персональные данные в отчёт не попадают (в группе их быть не должно).
export function makeReportsRepo(db: Db) {
  return {
    async collect(from: Date, to: Date): Promise<ReportData> {
      const inPeriod = (col: Parameters<typeof gte>[0]) => and(gte(col, from), lt(col, to));

      const [
        newTrainers,
        newClients,
        totalTrainers,
        totalClients,
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
      ] = await Promise.all([
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(trainers)
          .where(inPeriod(trainers.createdAt)),
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(clientAccounts)
          .where(inPeriod(clientAccounts.createdAt)),
        db.select({ n: sql<number>`count(*)::int` }).from(trainers),
        db.select({ n: sql<number>`count(*)::int` }).from(clientAccounts),
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
      ]);

      const one = (rows: { n: number }[]): number => rows[0]?.n ?? 0;

      return {
        growth: {
          newTrainers: one(newTrainers),
          newClientAccounts: one(newClients),
          totalTrainers: one(totalTrainers),
          totalClientAccounts: one(totalClients),
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
