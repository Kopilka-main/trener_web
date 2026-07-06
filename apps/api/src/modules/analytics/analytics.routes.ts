import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { analyticsIngestRequestSchema, type AnalyticsIngestRequest } from '@trener/shared';
import type {
  AnalyticsRepo,
  AnalyticsEventReadRow,
  AnalyticsSubjectType,
} from './analytics.types.js';
import { requireAuth } from '../../plugins/tenant-context.js';
import { requireClient } from '../../plugins/client-context.js';
import { makeClientScope, type ResolveScope } from '../../core/client-scope.js';
import { AppError, unauthorized } from '../../errors.js';

const okResponse = z.object({ ok: z.literal(true) });

const sessionsQuerySchema = z.object({
  subjectType: z.enum(['trainer', 'client']).optional(),
  subjectId: z.string().min(1).optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const sessionEventSchema = z.object({
  screen: z.string(),
  durationSec: z.number().int(),
  enteredAt: z.string(),
});

const sessionSchema = z.object({
  subjectType: z.enum(['trainer', 'client']),
  subjectId: z.string(),
  sessionId: z.string(),
  startedAt: z.string(),
  appVersion: z.string().nullable(),
  platform: z.string().nullable(),
  events: z.array(sessionEventSchema),
});

const sessionsResponseSchema = z.object({ sessions: z.array(sessionSchema) });

const DEFAULT_LIMIT = 100;
const KEY_SEP = '|';

// HTTP-слой аналитики экранов. Приём — тренерский (requireAuth) и клиентский
// (requireClient + resolveScope). Админ-выборка сессий — под ключом x-admin-key.
// Сборка repo и чтение ANALYTICS_ADMIN_KEY — в analytics.module.ts / app.ts.
export function analyticsRoutes(
  app: FastifyInstance,
  repo: AnalyticsRepo,
  newId: () => string,
  resolveScope: ResolveScope,
  adminKey: string | undefined,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const scope = makeClientScope(resolveScope);

  // Строки для батч-вставки: по строке на событие (durationSec=seconds, enteredAt=Date).
  function rowsFrom(
    body: AnalyticsIngestRequest,
    subjectType: AnalyticsSubjectType,
    subjectId: string,
  ) {
    return body.events.map((e) => ({
      id: newId(),
      subjectType,
      subjectId,
      sessionId: body.sessionId,
      screen: e.screen,
      durationSec: e.seconds,
      enteredAt: new Date(e.enteredAt),
      appVersion: body.appVersion ?? null,
      platform: body.platform ?? null,
    }));
  }

  // Тренерский приём.
  typed.post(
    '/api/analytics/events',
    {
      preHandler: requireAuth,
      schema: { body: analyticsIngestRequestSchema, response: { 200: okResponse } },
    },
    async (req) => {
      if (!req.trainerId) throw unauthorized('Требуется вход');
      await repo.insertEvents(rowsFrom(req.body, 'trainer', req.trainerId));
      return { ok: true as const };
    },
  );

  // Клиентский приём.
  typed.post(
    '/api/client/analytics/events',
    {
      preHandler: requireClient,
      schema: { body: analyticsIngestRequestSchema, response: { 200: okResponse } },
    },
    async (req) => {
      const { clientId } = await scope(req);
      await repo.insertEvents(rowsFrom(req.body, 'client', clientId));
      return { ok: true as const };
    },
  );

  // Гейт админ-выборки: без ключа в env → 503, неверный/отсутствующий x-admin-key → 401.
  function requireAdmin(
    req: FastifyRequest,
    _reply: FastifyReply,
    done: (err?: Error) => void,
  ): void {
    if (!adminKey) {
      done(new AppError(503, 'ANALYTICS_ADMIN_DISABLED', 'Аналитика недоступна: ключ не настроен'));
      return;
    }
    const provided = req.headers['x-admin-key'];
    if (typeof provided !== 'string' || provided !== adminKey) {
      done(unauthorized('Неверный админ-ключ'));
      return;
    }
    done();
  }

  // Админ-выборка сессий (без join к именам, только subjectId).
  typed.get(
    '/api/analytics/sessions',
    {
      preHandler: requireAdmin,
      schema: { querystring: sessionsQuerySchema, response: { 200: sessionsResponseSchema } },
    },
    async (req) => {
      const q = req.query;
      const events = await repo.listEvents({
        ...(q.subjectType ? { subjectType: q.subjectType } : {}),
        ...(q.subjectId ? { subjectId: q.subjectId } : {}),
        ...(q.from ? { from: q.from } : {}),
        ...(q.to ? { to: q.to } : {}),
      });
      return { sessions: groupSessions(events, q.limit ?? DEFAULT_LIMIT) };
    },
  );
}

type SessionAcc = {
  subjectType: AnalyticsSubjectType;
  subjectId: string;
  sessionId: string;
  startedAt: Date;
  appVersion: string | null;
  platform: string | null;
  events: z.infer<typeof sessionEventSchema>[];
};

// Группировка событий в сессии по (subjectType, subjectId, sessionId). События приходят
// возр. по enteredAt → внутри сессии уже отсортированы; startedAt = мин. enteredAt.
// Сессии — убыв. по startedAt, срез до limit.
function groupSessions(
  events: AnalyticsEventReadRow[],
  limit: number,
): z.infer<typeof sessionSchema>[] {
  const map = new Map<string, SessionAcc>();
  for (const e of events) {
    const key = [e.subjectType, e.subjectId, e.sessionId].join(KEY_SEP);
    let acc = map.get(key);
    if (!acc) {
      acc = {
        subjectType: e.subjectType,
        subjectId: e.subjectId,
        sessionId: e.sessionId,
        startedAt: e.enteredAt,
        appVersion: e.appVersion,
        platform: e.platform,
        events: [],
      };
      map.set(key, acc);
    }
    if (e.enteredAt < acc.startedAt) acc.startedAt = e.enteredAt;
    acc.events.push({
      screen: e.screen,
      durationSec: e.durationSec,
      enteredAt: e.enteredAt.toISOString(),
    });
  }
  return Array.from(map.values())
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
    .slice(0, limit)
    .map((s) => ({
      subjectType: s.subjectType,
      subjectId: s.subjectId,
      sessionId: s.sessionId,
      startedAt: s.startedAt.toISOString(),
      appVersion: s.appVersion,
      platform: s.platform,
      events: s.events,
    }));
}
