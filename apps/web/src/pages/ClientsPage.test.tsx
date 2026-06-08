import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ClientResponse } from '@trener/shared';
import { ClientsPage } from './ClientsPage';
import { useClients } from '../api/clients';
import { useSessions } from '../api/sessions';

vi.mock('../api/clients', () => ({
  useClients: vi.fn(),
}));
vi.mock('../api/sessions', () => ({
  useSessions: vi.fn(),
}));

const mockedUseClients = vi.mocked(useClients);
const mockedUseSessions = vi.mocked(useSessions);

function client(over: Partial<ClientResponse>): ClientResponse {
  return {
    id: 'c1',
    firstName: 'Иван',
    lastName: 'Петров',
    phone: null,
    accountId: null,
    birthDate: null,
    notes: null,
    status: 'active',
    contacts: [],
    tags: [],
    isOnline: false,
    avatarFileId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ClientsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockedUseClients.mockReset();
  mockedUseSessions.mockReset();
  mockedUseSessions.mockReturnValue({
    data: [],
  } as unknown as ReturnType<typeof useSessions>);
});

describe('ClientsPage', () => {
  it('рендерит список клиентов из мока', () => {
    mockedUseClients.mockReturnValue({
      data: [
        client({ id: 'c1', firstName: 'Иван', lastName: 'Петров' }),
        client({ id: 'c2', firstName: 'Мария', lastName: 'Сидорова' }),
      ],
      isPending: false,
      isError: false,
      isSuccess: true,
    } as unknown as ReturnType<typeof useClients>);

    renderPage();

    expect(screen.getByText('Иван Петров')).toBeInTheDocument();
    expect(screen.getByText('Мария Сидорова')).toBeInTheDocument();
  });

  it('показывает пустое состояние без клиентов', () => {
    mockedUseClients.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
      isSuccess: true,
    } as unknown as ReturnType<typeof useClients>);

    renderPage();

    expect(screen.getByText('Пока нет клиентов. Добавьте первого.')).toBeInTheDocument();
  });
});
