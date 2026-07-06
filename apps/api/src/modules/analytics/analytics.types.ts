import { analyticsScreenEvents } from '../../db/schema.js';

// Тип субъекта аналитики.
export type AnalyticsSubjectType = 'trainer' | 'client';

// Строка для батч-вставки (id/enteredAt формирует HTTP-слой из тела запроса).
export type AnalyticsScreenEventRow = typeof analyticsScreenEvents.$inferInsert;

// Строка чтения для админ-выборки сессий.
export type AnalyticsEventReadRow = {
  subjectType: AnalyticsSubjectType;
  subjectId: string;
  sessionId: string;
  screen: string;
  durationSec: number;
  enteredAt: Date;
  appVersion: string | null;
  platform: string | null;
};

// Фильтры админ-выборки сессий.
export type AnalyticsSessionsFilter = {
  subjectType?: AnalyticsSubjectType;
  subjectId?: string;
  from?: string; // YYYY-MM-DD (включительно, от начала дня UTC)
  to?: string; // YYYY-MM-DD (включительно, до конца дня UTC)
};

// Интерфейс репозитория аналитики. HTTP-слой (routes) зависит от него, а не от
// реализации в analytics.repo.ts — правило CLAUDE.md «routes не импортирует repo».
export interface AnalyticsRepo {
  insertEvents(rows: AnalyticsScreenEventRow[]): Promise<void>;
  listEvents(filter: AnalyticsSessionsFilter): Promise<AnalyticsEventReadRow[]>;
}
