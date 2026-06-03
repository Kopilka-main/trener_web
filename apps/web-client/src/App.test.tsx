import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';
import * as auth from './api/auth';

vi.mock('./api/auth');

function renderApp() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('App gate', () => {
  beforeEach(() => {
    vi.mocked(auth.useClientLogout).mockReturnValue({ mutate: vi.fn() } as never);
    vi.mocked(auth.useClientLogin).mockReturnValue({
      mutate: vi.fn(),
      isError: false,
      isPending: false,
    } as never);
    vi.mocked(auth.useClientRegister).mockReturnValue({
      mutate: vi.fn(),
      isError: false,
      isPending: false,
    } as never);
  });

  it('не залогинен → экран входа', () => {
    vi.mocked(auth.useClientMe).mockReturnValue({ isLoading: false, data: null } as never);
    renderApp();
    expect(screen.getByRole('heading', { name: 'Вход' })).toBeInTheDocument();
  });

  it('залогинен без привязки → экран подключения с кодом', () => {
    vi.mocked(auth.useClientMe).mockReturnValue({
      isLoading: false,
      data: {
        account: {
          id: 'CODE-123',
          email: 'a@b.co',
          firstName: 'И',
          lastName: 'К',
          avatarFileId: null,
        },
        link: null,
      },
    } as never);
    renderApp();
    expect(screen.getByText('Подключение')).toBeInTheDocument();
    expect(screen.getByText('CODE-123')).toBeInTheDocument();
  });

  it('привязан → нижняя навигация', () => {
    vi.mocked(auth.useClientMe).mockReturnValue({
      isLoading: false,
      data: {
        account: { id: 'ca1', email: 'a@b.co', firstName: 'И', lastName: 'К', avatarFileId: null },
        link: { trainerId: 't1', clientId: 'cl1' },
      },
    } as never);
    renderApp();
    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByRole('navigation')).toHaveTextContent('Тренировки');
    expect(screen.getByRole('navigation')).toHaveTextContent('Профиль');
  });
});
