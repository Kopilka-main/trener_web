import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiError, apiFetch } from './client';

function mockFetchOnce(init: { ok: boolean; status: number; body?: unknown; text?: string }) {
  const text = init.text ?? (init.body === undefined ? '' : JSON.stringify(init.body));
  const fetchMock = vi.fn().mockResolvedValue({
    ok: init.ok,
    status: init.status,
    statusText: '',
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(init.body),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('apiFetch', () => {
  it('возвращает распарсенные данные при ok', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 200, body: { value: 42 } });
    const result = await apiFetch<{ value: number }>('/thing');
    expect(result).toEqual({ value: 42 });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/thing',
      expect.objectContaining({ credentials: 'include', method: 'GET' }),
    );
  });

  it('валидирует тело переданной схемой', async () => {
    mockFetchOnce({ ok: true, status: 200, body: { value: 7 } });
    const schema = z.object({ value: z.number() });
    const result = await apiFetch('/thing', { schema });
    expect(result).toEqual({ value: 7 });
  });

  it('сериализует body и проставляет JSON-заголовок', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 200, body: { ok: true } });
    await apiFetch('/thing', { method: 'POST', body: { a: 1 } });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/thing',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ a: 1 }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  it('бросает ApiError со status и code при !ok', async () => {
    mockFetchOnce({
      ok: false,
      status: 401,
      body: { error: 'Требуется вход', code: 'UNAUTHORIZED' },
    });
    await expect(apiFetch('/auth/me')).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Требуется вход',
    });
  });

  it('ApiError с дефолтным кодом при не-JSON теле ошибки', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      json: () => Promise.reject(new Error('not json')),
      text: () => Promise.resolve(''),
    });
    vi.stubGlobal('fetch', fetchMock);
    const err = await apiFetch('/thing').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(500);
    expect((err as ApiError).code).toBe('UNKNOWN');
  });

  it('возвращает undefined для пустого тела (204)', async () => {
    mockFetchOnce({ ok: true, status: 204, text: '' });
    const result = await apiFetch('/auth/logout', { method: 'POST' });
    expect(result).toBeUndefined();
  });
});
