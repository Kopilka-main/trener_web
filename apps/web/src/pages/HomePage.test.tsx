import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ClientResponse, SessionResponse } from '@trener/shared';
import { HomePage } from './HomePage';
import { useClients } from '../api/clients';
import { useExercises } from '../api/exercises';
import { useSessions } from '../api/sessions';
import { useAccountingSummary } from '../api/accounting';

vi.mock('../api/clients', () => ({ useClients: vi.fn() }));
vi.mock('../api/exercises', () => ({ useExercises: vi.fn() }));
vi.mock('../api/sessions', () => ({ useSessions: vi.fn() }));
vi.mock('../api/accounting', () => ({ useAccountingSummary: vi.fn() }));

const mockedUseClients = vi.mocked(useClients);
const mockedUseExercises = vi.mocked(useExercises);
const mockedUseSessions = vi.mocked(useSessions);
const mockedUseAccounting = vi.mocked(useAccountingSummary);

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
    avatarFileId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function session(over: Partial<SessionResponse>): SessionResponse {
  return {
    id: 's1',
    clientId: 'c1',
    workoutId: null,
    date: '2026-06-02',
    startTime: '10:00',
    durationMin: 60,
    location: null,
    title: null,
    status: 'planned',
    isOnline: false,
    note: null,
    clientConfirmation: 'pending',
    ...over,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockedUseClients.mockReset();
  mockedUseExercises.mockReset();
  mockedUseSessions.mockReset();
  mockedUseAccounting.mockReset();

  mockedUseClients.mockReturnValue({
    data: [client({ id: 'c1' }), client({ id: 'c2', status: 'archived' })],
  } as unknown as ReturnType<typeof useClients>);
  mockedUseExercises.mockReturnValue({
    data: new Array(7).fill(null).map((_, i) => ({ id: `e${i}` })),
  } as unknown as ReturnType<typeof useExercises>);
  mockedUseSessions.mockReturnValue({
    data: [],
  } as unknown as ReturnType<typeof useSessions>);
  mockedUseAccounting.mockReturnValue({
    data: { from: '2026-06-01', to: '2026-06-02', totalIncome: 0, totalExpense: 0, balance: 0 },
  } as unknown as ReturnType<typeof useAccountingSummary>);
});

describe('HomePage', () => {
  it('рендерит шапку-дату, hero и плитки', () => {
    renderPage();
    expect(screen.getByText(/СЕГОДНЯ ·/)).toBeInTheDocument();
    expect(screen.getByText('Клиенты')).toBeInTheDocument();
    expect(screen.getByText('Календарь')).toBeInTheDocument();
    expect(screen.getByText('Финансы')).toBeInTheDocument();
    expect(screen.getByText('Уведомления')).toBeInTheDocument();
  });

  it('считает только активных клиентов', () => {
    renderPage();
    // c2 archived → активных 1 → плитка показывает «01».
    expect(screen.getByText('01')).toBeInTheDocument();
    expect(screen.getByText('активных')).toBeInTheDocument();
  });

  it('показывает строку следующей сессии с именем клиента', () => {
    mockedUseSessions.mockReturnValue({
      data: [session({ id: 's1', clientId: 'c1', date: '2026-12-31', startTime: '10:00' })],
    } as unknown as ReturnType<typeof useSessions>);
    renderPage();
    expect(screen.getByText(/СЛЕД\. · 10:00 ИВАН П\./)).toBeInTheDocument();
  });
});
