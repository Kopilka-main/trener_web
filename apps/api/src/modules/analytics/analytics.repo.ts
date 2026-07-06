import { and, asc, eq, gte, lte, type SQL } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { analyticsScreenEvents } from '../../db/schema.js';
import type {
  AnalyticsEventReadRow,
  AnalyticsRepo,
  AnalyticsScreenEventRow,
  AnalyticsSessionsFilter,
} from './analytics.types.js';

const readColumns = {
  subjectType: analyticsScreenEvents.subjectType,
  subjectId: analyticsScreenEvents.subjectId,
  sessionId: analyticsScreenEvents.sessionId,
  screen: analyticsScreenEvents.screen,
  durationSec: analyticsScreenEvents.durationSec,
  enteredAt: analyticsScreenEvents.enteredAt,
  appVersion: analyticsScreenEvents.appVersion,
  platform: analyticsScreenEvents.platform,
};

// Репозиторий аналитики экранов — админ-данные без тенант-скоупа (как telemetry).
// HTTP-слой не импортирует. Группировку событий в сессии делает вызывающий код.
export function makeAnalyticsRepo(db: Db): AnalyticsRepo {
  return {
    // Батч-вставка событий (по строке на событие). Пустой массив — no-op.
    async insertEvents(rows: AnalyticsScreenEventRow[]): Promise<void> {
      if (rows.length === 0) return;
      await db.insert(analyticsScreenEvents).values(rows);
    },

    // События по фильтрам (субъект/диапазон дат), возр. по enteredAt.
    async listEvents(filter: AnalyticsSessionsFilter): Promise<AnalyticsEventReadRow[]> {
      const conds: SQL[] = [];
      if (filter.subjectType) {
        conds.push(eq(analyticsScreenEvents.subjectType, filter.subjectType));
      }
      if (filter.subjectId) {
        conds.push(eq(analyticsScreenEvents.subjectId, filter.subjectId));
      }
      if (filter.from) {
        conds.push(gte(analyticsScreenEvents.enteredAt, new Date(`${filter.from}T00:00:00.000Z`)));
      }
      if (filter.to) {
        conds.push(lte(analyticsScreenEvents.enteredAt, new Date(`${filter.to}T23:59:59.999Z`)));
      }
      return db
        .select(readColumns)
        .from(analyticsScreenEvents)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(asc(analyticsScreenEvents.enteredAt));
    },
  };
}
