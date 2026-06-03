import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WorkoutsListPage } from './WorkoutsListPage';
import * as api from '../api/workouts';
import * as auth from '../api/auth';

vi.mock('../api/workouts');
vi.mock('../api/auth');

function mockMe(linked: boolean) {
  vi.mocked(auth.useClientMe).mockReturnValue({
    isLoading: false,
    data: {
      account: { id: 'ca1', email: 'a@b.co', firstName: 'И', lastName: 'К', avatarFileId: null },
      link: linked ? { trainerId: 't1', clientId: 'cl1' } : null,
    },
  } as never);
}

function renderPage() {
  return render(
    <MemoryRouter>
      <WorkoutsListPage />
    </MemoryRouter>,
  );
}

describe('WorkoutsListPage', () => {
  beforeEach(() => vi.resetAllMocks());

  it('привязан, пусто → «нет завершённых тренировок»', () => {
    mockMe(true);
    vi.mocked(api.useClientWorkouts).mockReturnValue({
      isLoading: false,
      isError: false,
      data: [],
    } as never);
    renderPage();
    expect(screen.getByText('Пока нет завершённых тренировок.')).toBeInTheDocument();
  });

  it('не привязан, пусто → приглашение подключить тренера', () => {
    mockMe(false);
    vi.mocked(api.useClientWorkouts).mockReturnValue({
      isLoading: false,
      isError: false,
      data: [],
    } as never);
    renderPage();
    expect(screen.getByText(/Вы пока не подключены к тренеру/)).toBeInTheDocument();
  });

  it('показывает карточку тренировки', () => {
    mockMe(true);
    vi.mocked(api.useClientWorkouts).mockReturnValue({
      isLoading: false,
      isError: false,
      data: [
        {
          id: 'w1',
          clientId: 'c1',
          name: 'Грудь+трицепс',
          status: 'completed',
          startedAt: null,
          completedAt: '2026-06-03T08:30:00Z',
          durationSec: 3600,
          trainerNote: null,
          rpe: 7,
          exercises: [{ position: 0, exerciseId: 'e1', exerciseName: 'Жим', sets: [] }],
        },
      ],
    } as never);
    renderPage();
    expect(screen.getByText('Грудь+трицепс')).toBeInTheDocument();
  });
});
