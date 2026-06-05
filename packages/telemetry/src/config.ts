import type { TelemetrySource } from '@trener/shared';

export type TelemetryConfig = {
  apiBaseUrl: string;
  source: TelemetrySource;
  appVersion?: string;
};

let cfg: TelemetryConfig | null = null;

export function setConfig(c: TelemetryConfig): void {
  cfg = c;
}
export function getConfig(): TelemetryConfig | null {
  return cfg;
}

const SESSION_KEY = 'telemetry.sid';

export function getSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return 'no-session';
  }
}
