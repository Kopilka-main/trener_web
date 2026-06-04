import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { WorkoutResponse } from '@trener/shared';
import { WorkoutsListPage } from './WorkoutsListPage';
import * as api from '../api/workouts';
import * as auth from '../api/auth';
import * as templatesApi from '../api/templates';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('../api/workouts');
vi.mock('../api/auth');
vi.mock('../api/templates');

function mockTemplates() {
  vi.mocked(templatesApi.useClientTemplates).mockReturnValue({
    data: [],
    isLoading: false,
  } as never);
  vi.mocked(templatesApi.useSaveTemplate).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    isSuccess: false,
  } as never);
  vi.mocked(templatesApi.useDeleteTemplate).mockReturnValue({ mutate: vi.fn() } as never);
}

function mockMe(linked: boolean) {
  vi.mocked(auth.useClientMe).mockReturnValue({
    isLoading: false,
    data: {
      account: { id: 'ca1', email: 'a@b.co', firstName: 'И', lastName: 'К', avatarFileId: null },
      link: linked ? { trainerId: 't1', clientId: 'cl1' } : null,
    },
  } as never);
}

function mockMutations(start = vi.fn(), del = vi.fn(), create = vi.fn()) {
  vi.mocked(api.useCreateWorkout).mockReturnValue({ mutate: create, isPending: false } as never);
  vi.mocked(api.useStartWorkout).mockReturnValue({ mutate: start, isPending: false } as never);
  vi.mocked(api.useDeleteWorkout).mockReturnValue({ mutate: del, isPending: false } as never);
  return { start, del, create };
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
    mockTemplates();
  });

  it('привязан, пусто → карточка-плейсхолдер новой тренировки', () => {
    mockMe(true);
    vi.mocked(api.useClientWorkouts).mockReturnValue({
      isLoading: false,
      isError: false,
      data: [],
    } as never);
    renderPage();
    expect(screen.getByText('Тренировка не запланирована')).toBeInTheDocument();
    expect(screen.getByText('Выбрать из базы')).toBeInTheDocument();
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

  it('«Выбрать из базы» → пикер с тренировками от тренера; выбор создаёт из плана', () => {
    mockMe(true);
    const { create } = mockMutations();
    mockTemplates();
    vi.mocked(api.useClientWorkouts).mockReturnValue({
      isLoading: false,
      isError: false,
      data: [
        workout({
          id: 'tr1',
          name: 'Push план',
          status: 'active',
          createdByClient: false,
          exercises: [
            {
              position: 0,
              exerciseId: 'e1',
              exerciseName: 'Жим',
              sets: [
                {
                  setIndex: 0,
                  plannedReps: 10,
                  plannedWeightKg: 60,
                  plannedTimeSec: null,
                  plannedRestSec: null,
                  actualReps: null,
                  actualWeightKg: null,
                  actualTimeSec: null,
                  done: false,
                },
              ],
            },
          ],
        }),
      ],
    } as never);
    renderPage();
    fireEvent.click(screen.getByText('Выбрать из базы'));
    expect(screen.getByText('Выберите шаблон')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Push план'));
    expect(create).toHaveBeenCalledWith(
      {
        name: 'Push план',
        exercises: [{ exerciseId: 'e1', sets: [{ plannedReps: 10, plannedWeightKg: 60 }] }],
      },
      expect.anything(),
    );
  });

  it('пикер шаблонов: выбор шаблона создаёт тренировку из его плана', () => {
    mockMe(true);
    const { create } = mockMutations();
    vi.mocked(templatesApi.useClientTemplates).mockReturnValue({
      data: [
        { id: 'tpl1', name: 'Push', exercises: [{ exerciseId: 'e1', sets: [{}] }], createdAt: '' },
      ],
      isLoading: false,
    } as never);
    vi.mocked(api.useClientWorkouts).mockReturnValue({
      isLoading: false,
      isError: false,
      data: [],
    } as never);
    renderPage();
    fireEvent.click(screen.getByText('Выбрать из базы'));
    fireEvent.click(screen.getByText('Push'));
    expect(create).toHaveBeenCalledWith(
      { name: 'Push', exercises: [{ exerciseId: 'e1', sets: [{}] }] },
      expect.anything(),
    );
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

  it('черновик: «Открыть» ведёт на /run (форму плана)', () => {
    mockMe(true);
    vi.mocked(api.useClientWorkouts).mockReturnValue({
      isLoading: false,
      isError: false,
      data: [workout({ id: 'd1', name: 'Черновик', status: 'draft', createdByClient: true })],
    } as never);
    renderPage();
    fireEvent.click(screen.getByText('Открыть'));
    expect(navigate).toHaveBeenCalledWith('/workouts/d1/run');
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
