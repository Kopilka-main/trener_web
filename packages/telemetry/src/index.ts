import { setConfig, type TelemetryConfig } from './config.js';
import { startAutoTracking } from './track.js';
import { installErrorHandlers } from './errors.js';

export { track, pageView, reportError } from './track.js';
export { TelemetryRouter } from './TelemetryRouter.js';
export { ErrorBoundary } from './ErrorBoundary.js';
export type { TelemetryConfig } from './config.js';

/** Вызвать один раз при старте приложения. */
export function initTelemetry(config: TelemetryConfig): void {
  setConfig(config);
  startAutoTracking();
  installErrorHandlers();
}
