import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { WorkoutResponse } from '@trener/shared';
import { WorkoutsListPage } from './WorkoutsListPage';
import * as api from '../api/workouts';
import * as auth from '../api/auth';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

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

function mockMutations(start = vi.fn(), del = vi.fn()) {
  vi.mocked(api.useStartWorkout).mockReturnValue({ mutate: start, isPending: false } as never);
  vi.mocked(api.useDeleteWorkout).mockReturnValue({ mutate: del, isPending: false } as never);
  return { start, del };
}

function workout(over: Partial<WorkoutResponse> = {}): WorkoutResponse {
  return {
    id: 'w1',
    clientId: 'c1',
    name: 'Тренировка',
    status: 'completed',
    startedAt: null,
    completedAt: '2026-06-03T08:30:00Z',
    durationSec: 3600,
    trainerNote: null,
    rpe: 7,
    createdByClient: false,
    exercises: [{ position: 0, exerciseId: 'e1', exerciseName: 'Жим', sets: [] }],
    ...over,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <WorkoutsListPage />
    </MemoryRouter>,
  );
}

describe('WorkoutsListPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockMutations();
  });

  it('привязан, пусто → подсказка создать тренировку', () => {
    mockMe(true);
    vi.mocked(api.useClientWorkouts).mockReturnValue({
      isLoading: false,
      isError: false,
      data: [],
    } as never);
    renderPage();
    expect(screen.getByText(/Пока нет тренировок/)).toBeInTheDocument();
  });

  it('не привязан → приглашение подключить тренера, нет кнопки «Новая»', () => {
    mockMe(false);
    vi.mocked(api.useClientWorkouts).mockReturnValue({
      isLoading: false,
      isError: false,
      data: [],
    } as never);
    renderPage();
    expect(screen.getByText(/Вы пока не подключены к тренеру/)).toBeInTheDocument();
    expect(screen.queryByText('Новая тренировка')).not.toBeInTheDocument();
  });

  it('привязан → кнопка «Новая» ведёт на /workouts/new', () => {
    mockMe(true);
    vi.mocked(api.useClientWorkouts).mockReturnValue({
      isLoading: false,
      isError: false,
      data: [],
    } as never);
    renderPage();
    fireEvent.click(screen.getByText('Новая тренировка'));
    expect(navigate).toHaveBeenCalledWith('/workouts/new');
  });

  it('разделяет свои активные/черновики и завершённые с бейджами', () => {
    mockMe(true);
    vi.mocked(api.useClientWorkouts).mockReturnValue({
      isLoading: false,
      isError: false,
      data: [
        workout({ id: 'own1', name: 'Своя активная', status: 'active', createdByClient: true }),
        workout({ id: 'tr1', name: 'От тренера', status: 'completed', createdByClient: false }),
        workout({
          id: 'own2',
          name: 'Своя завершённая',
          status: 'completed',
          createdByClient: true,
        }),
      ],
    } as never);
    renderPage();
    expect(screen.getByText('Активные и черновики')).toBeInTheDocument();
    expect(screen.getByText('Своя активная')).toBeInTheDocument();
    expect(screen.getByText('Завершённые')).toBeInTheDocument();
    expect(screen.getByText('От тренера')).toBeInTheDocument();
    expect(screen.getByText('от тренера')).toBeInTheDocument();
    expect(screen.getByText('своя')).toBeInTheDocument();
  });

  it('черновик: «Начать» вызывает useStartWorkout', () => {
    mockMe(true);
    const { start } = mockMutations();
    vi.mocked(api.useClientWorkouts).mockReturnValue({
      isLoading: false,
      isError: false,
      data: [workout({ id: 'd1', name: 'Черновик', status: 'draft', createdByClient: true })],
    } as never);
    renderPage();
    fireEvent.click(screen.getByText('Начать'));
    expect(start).toHaveBeenCalledWith('d1', expect.anything());
  });

  it('активная: «Продолжить» ведёт на /run', () => {
    mockMe(true);
    vi.mocked(api.useClientWorkouts).mockReturnValue({
      isLoading: false,
      isError: false,
      data: [workout({ id: 'a1', name: 'Активная', status: 'active', createdByClient: true })],
    } as never);
    renderPage();
    fireEvent.click(screen.getByText('Продолжить'));
    expect(navigate).toHaveBeenCalledWith('/workouts/a1/run');
  });
});
