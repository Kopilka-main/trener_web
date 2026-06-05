import type { ZodType } from 'zod';
import { markOffline, markOnline } from '../lib/connectivity';

/** Базовый префикс API. Dev: Vite-прокси `/api`→:3001; prod: nginx раздаёт `/api`. */
const API_BASE = '/api';

/** Типобезопасная ошибка ответа API. Несёт HTTP-статус, код домена и сообщение. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export interface ApiFetchOptions<T> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  schema?: ZodType<T>;
}

interface ApiErrorBody {
  error?: unknown;
  code?: unknown;
}

/**
 * Делает запрос к API с cookie-сессией (`credentials: 'include'`).
 * При !ok парсит `{ error, code }` и бросает {@link ApiError}.
 * Для пустого тела (204/нет контента) возвращает undefined.
 * При наличии `schema` — валидирует тело ответа.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions<T> = {},
): Promise<T> {
  const { method = 'GET', body, schema } = options;
  const hasBody = body !== undefined;

  const init: RequestInit = { method, credentials: 'include' };
  if (hasBody) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, init);
  } catch (err) {
    // Отмена запроса (навигация) — не сетевой сбой, статус связи не трогаем.
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    // fetch отклонился — нет интернета или сервер недоступен.
    markOffline();
    throw err;
  }
  // Ответ получен (даже если это 4xx/5xx) — сервер достижим, связь есть.
  markOnline();

  if (!res.ok) {
    let code = 'UNKNOWN';
    let message = res.statusText || `Ошибка запроса (${String(res.status)})`;
    try {
      const errBody = (await res.json()) as ApiErrorBody;
      if (typeof errBody.code === 'string') code = errBody.code;
      if (typeof errBody.error === 'string') message = errBody.error;
    } catch {
      // тело не JSON — оставляем дефолтные значения
    }
    throw new ApiError(res.status, code, message);
  }

  // Пустое тело (204 No Content или Content-Length: 0) → undefined.
  if (res.status === 204) {
    return undefined as T;
  }
  const text = await res.text();
  if (text.length === 0) {
    return undefined as T;
  }

  const data: unknown = JSON.parse(text);
  return schema ? schema.parse(data) : (data as T);
}
