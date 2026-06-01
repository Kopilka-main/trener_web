import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClientResponse } from '@trener/shared';
import { apiFetch } from './client';
import { createClient, deleteClient, getClient, listClients, updateClient } from './clients';

vi.mock('./client', () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);

function client(over: Partial<ClientResponse> = {}): ClientResponse {
  return {
    id: 'c1',
    firstName: 'Иван',
    lastName: 'Петров',
    phone: null,
    notes: null,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('clients api', () => {
  it('listClients разворачивает {clients}', async () => {
    mockedApiFetch.mockResolvedValue({ clients: [client()] });
    const result = await listClients();
    expect(result).toHaveLength(1);
    expect(mockedApiFetch).toHaveBeenCalledWith('/clients', expect.any(Object));
  });

  it('getClient разворачивает {client}', async () => {
    mockedApiFetch.mockResolvedValue({ client: client({ id: 'c9' }) });
    const result = await getClient('c9');
    expect(result.id).toBe('c9');
    expect(mockedApiFetch).toHaveBeenCalledWith('/clients/c9', expect.any(Object));
  });

  it('createClient шлёт POST с телом', async () => {
    mockedApiFetch.mockResolvedValue({ client: client() });
    await createClient({ firstName: 'Иван', lastName: 'Петров', phone: null, notes: null });
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/clients',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('updateClient шлёт PATCH на /clients/:id', async () => {
    mockedApiFetch.mockResolvedValue({ client: client({ status: 'archived' }) });
    const result = await updateClient('c1', { status: 'archived' });
    expect(result.status).toBe('archived');
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/clients/c1',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('deleteClient шлёт DELETE на /clients/:id', async () => {
    mockedApiFetch.mockResolvedValue({ ok: true });
    const result = await deleteClient('c1');
    expect(result.ok).toBe(true);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/clients/c1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
