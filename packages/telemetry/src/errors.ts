import { reportError } from './track.js';

let installed = false;

export function installErrorHandlers(): void {
  if (installed) return;
  installed = true;

  window.addEventListener('error', (ev) => {
    reportError({
      name: ev.error instanceof Error ? ev.error.name : 'Error',
      message: ev.message || 'window.onerror',
      stack: ev.error instanceof Error ? (ev.error.stack ?? null) : null,
      path: location.pathname,
    });
  });

  window.addEventListener('unhandledrejection', (ev) => {
    const reason: unknown = ev.reason;
    reportError({
      name: reason instanceof Error ? reason.name : 'UnhandledRejection',
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? (reason.stack ?? null) : null,
      path: location.pathname,
    });
  });
}
