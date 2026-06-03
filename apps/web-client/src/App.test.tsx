import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';
import * as auth from './api/auth';
import * as workouts from './api/workouts';

vi.mock('./api/auth');
vi.mock('./api/workouts');

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
    // Список тренировок на главном экране — пустой, без сети.
    vi.mocked(workouts.useClientWorkouts).mockReturnValue({
      isLoading: false,
      isError: false,
      data: [],
    } as never);
  });

  it('не залогинен → экран входа', () => {
    vi.mocked(auth.useClientMe).mockReturnValue({ isLoading: false, data: null } as never);
    renderApp();
    expect(screen.getByRole('heading', { name: 'Вход' })).toBeInTheDocument();
  });

  it('залогинен без привязки → приложение с баннером «Подключить тренера»', () => {
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
    // В приложение пустили (есть нижняя навигация) и показан баннер подключения.
    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByText('Подключить тренера')).toBeInTheDocument();
  });

  it('привязан → нижняя навигация, баннера нет', () => {
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
    expect(screen.queryByText('Подключить тренера')).not.toBeInTheDocument();
  });
});
