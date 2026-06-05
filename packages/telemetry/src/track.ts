import type { AnalyticsEventInput, ClientErrorInput } from '@trener/shared';
import { getConfig, getSessionId } from './config.js';
import { makeQueue } from './queue.js';
import { clickLabel } from './clicks.js';

function postBatch(pathSuffix: 'events' | 'errors', payload: object): Promise<void> {
  const cfg = getConfig();
  if (!cfg) return Promise.resolve();
  return fetch(`${cfg.apiBaseUrl}/api/telemetry/${pathSuffix}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'include',
    keepalive: true,
  }).then(
    () => undefined,
    () => undefined,
  );
}

const eventsQueue = makeQueue<AnalyticsEventInput>({
  maxBatch: 50,
  max: 500,
  send: (events) => {
    const cfg = getConfig();
    if (!cfg) return Promise.resolve();
    return postBatch('events', { source: cfg.source, sessionId: getSessionId(), events });
  },
});

const errorsQueue = makeQueue<ClientErrorInput>({
  maxBatch: 20,
  max: 100,
  send: (errors) => {
    const cfg = getConfig();
    if (!cfg) return Promise.resolve();
    return postBatch('errors', { source: cfg.source, sessionId: getSessionId(), errors });
  },
});

export function track(
  name: string,
  props?: Record<string, string | number | boolean | null>,
): void {
  eventsQueue.push({ name, path: location.pathname, props });
}

export function pageView(path: string): void {
  eventsQueue.push({ name: 'page_view', path });
}

export function reportError(e: ClientErrorInput): void {
  errorsQueue.push(e);
  void errorsQueue.flush();
}

let flushTimer: number | null = null;
let started = false;

export function startAutoTracking(): void {
  if (started) return;
  started = true;

  document.addEventListener(
    'click',
    (ev) => {
      const label = clickLabel(ev.target as HTMLElement | null);
      if (label) track('click', { label });
    },
    { capture: true },
  );

  flushTimer = window.setInterval(() => void eventsQueue.flush(), 5000);

  const flushAll = () => {
    void eventsQueue.flush();
    void errorsQueue.flush();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAll();
  });
  window.addEventListener('pagehide', flushAll);
}

export function stopAutoTracking(): void {
  if (flushTimer !== null) window.clearInterval(flushTimer);
  flushTimer = null;
  started = false;
}
