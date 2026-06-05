import type { Db } from '../../db/client.js';
import { analyticsEvents, errorLogs } from '../../db/schema.js';

export type AnalyticsEventRow = typeof analyticsEvents.$inferInsert;
export type ErrorLogRow = typeof errorLogs.$inferInsert;

// Телеметрия — админ-данные без тенант-скоупа (осознанное исключение из CLAUDE.md).
export function makeTelemetryRepo(db: Db) {
  return {
    async insertEvents(rows: AnalyticsEventRow[]): Promise<void> {
      if (rows.length === 0) return;
      await db.insert(analyticsEvents).values(rows);
    },
    async insertErrors(rows: ErrorLogRow[]): Promise<void> {
      if (rows.length === 0) return;
      await db.insert(errorLogs).values(rows);
    },
  };
}

export type TelemetryRepo = ReturnType<typeof makeTelemetryRepo>;
