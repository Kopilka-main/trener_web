import type { AnalyticsBatchRequest, ClientErrorBatchRequest } from '@trener/shared';
import type { TelemetryRepo, AnalyticsEventRow, ErrorLogRow } from './telemetry.repo.js';

export type ActorType = 'trainer' | 'client' | 'anon';
export type Actor = { actorType: ActorType; actorId: string | null };
export type TelemetryDeps = { newId: () => string };

const MAX_PROPS_KEYS = 16;

function clampProps(props: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!props) return {};
  const out: Record<string, unknown> = {};
  let n = 0;
  for (const [k, v] of Object.entries(props)) {
    if (n >= MAX_PROPS_KEYS) break;
    if (v === null || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v;
      n++;
    } else if (typeof v === 'string') {
      out[k] = v.slice(0, 200);
      n++;
    }
  }
  return out;
}

function clampUa(ua: string | null): string | null {
  return ua ? ua.slice(0, 400) : null;
}

export function makeTelemetryService(repo: TelemetryRepo, deps: TelemetryDeps) {
  return {
    async ingestEvents(
      batch: AnalyticsBatchRequest,
      actor: Actor,
      ua: string | null,
    ): Promise<number> {
      const rows: AnalyticsEventRow[] = batch.events.map((e) => ({
        id: deps.newId(),
        source: batch.source,
        actorType: actor.actorType,
        actorId: actor.actorId,
        sessionId: batch.sessionId,
        name: e.name.slice(0, 64),
        path: e.path ? e.path.slice(0, 512) : null,
        props: clampProps(e.props),
        ua: clampUa(ua),
      }));
      await repo.insertEvents(rows);
      return rows.length;
    },

    async ingestClientErrors(
      batch: ClientErrorBatchRequest,
      actor: Actor,
      ua: string | null,
    ): Promise<number> {
      const rows: ErrorLogRow[] = batch.errors.map((e) => ({
        id: deps.newId(),
        source: batch.source,
        level: 'error',
        name: e.name ?? null,
        message: e.message.slice(0, 2000),
        stack: e.stack ?? null,
        path: e.path ?? null,
        actorType: actor.actorType,
        actorId: actor.actorId,
        ua: clampUa(ua),
        context: clampProps(e.context),
      }));
      await repo.insertErrors(rows);
      return rows.length;
    },

    async recordApiError(input: {
      message: string;
      name?: string | null;
      stack?: string | null;
      path?: string | null;
      method?: string | null;
      statusCode?: number | null;
      actorType: ActorType;
      actorId: string | null;
      context?: Record<string, unknown>;
    }): Promise<void> {
      const row: ErrorLogRow = {
        id: deps.newId(),
        source: 'api',
        level: 'error',
        name: input.name ?? null,
        message: input.message.slice(0, 2000),
        stack: input.stack ? input.stack.slice(0, 8000) : null,
        path: input.path ?? null,
        method: input.method ?? null,
        statusCode: input.statusCode ?? null,
        actorType: input.actorType,
        actorId: input.actorId,
        context: clampProps(input.context),
      };
      await repo.insertErrors([row]);
    },
  };
}

export type TelemetryService = ReturnType<typeof makeTelemetryService>;
