import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { KnowledgePage } from './KnowledgePage';
import * as workoutsApi from '../api/workouts';
import * as exercisesApi from '../api/exercises';
import * as auth from '../api/auth';

vi.mock('../api/workouts');
vi.mock('../api/exercises');
vi.mock('../api/auth');

function makeWorkout(exerciseId: string, name: string, weight: number) {
  return {
    id: `w-${exerciseId}`,
    clientId: 'c1',
    name: 'Тренировка',
    status: 'completed',
    startedAt: null,
    completedAt: '2026-06-03T08:30:00Z',
    durationSec: 3600,
    trainerNote: null,
    rpe: null,
    exercises: [
      {
        position: 0,
        exerciseId,
        exerciseName: name,
        sets: [
          {
            setIndex: 0,
            plannedReps: 10,
            plannedWeightKg: weight,
            plannedTimeSec: null,
            plannedRestSec: null,
            actualReps: 10,
            actualWeightKg: weight,
            actualTimeSec: null,
            done: true,
          },
        ],
      },
    ],
  };
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

function renderPage() {
  return render(
    <MemoryRouter>
      <KnowledgePage />
    </MemoryRouter>,
  );
}

describe('KnowledgePage', () => {
  beforeEach(() => vi.resetAllMocks());

  it('рендерит список из охвата тренировок, обогащённый каталогом', () => {
    mockMe(true);
    vi.mocked(workoutsApi.useClientWorkouts).mockReturnValue({
      isLoading: false,
      isError: false,
      isSuccess: true,
      data: [makeWorkout('e1', 'Жим лёжа', 80), makeWorkout('e2', 'Присед', 100)],
    } as never);
    vi.mocked(exercisesApi.useClientExercises).mockReturnValue({
      isLoading: false,
      isError: false,
      isSuccess: true,
      data: [
        {
          id: 'e1',
          isGlobal: true,
          name: 'Жим лёжа',
          category: 'Грудь',
          subgroup: 'Середина',
          description: null,
          defaultReps: null,
          defaultWeightKg: null,
          defaultTimeSec: null,
          restSec: 90,
          note: null,
        },
        {
          id: 'e2',
          isGlobal: true,
          name: 'Присед',
          category: 'Ноги',
          subgroup: 'Квадрицепс',
          description: null,
          defaultReps: null,
          defaultWeightKg: null,
          defaultTimeSec: null,
          restSec: 90,
          note: null,
        },
      ],
    } as never);
    renderPage();
    expect(screen.getByText('Жим лёжа')).toBeInTheDocument();
    expect(screen.getByText('Присед')).toBeInTheDocument();
    expect(screen.getByText('Грудь · Середина')).toBeInTheDocument();
  });

  it('фильтрует список по выбранной группе мышц', () => {
    mockMe(true);
    vi.mocked(workoutsApi.useClientWorkouts).mockReturnValue({
      isLoading: false,
      isError: false,
      isSuccess: true,
      data: [makeWorkout('e1', 'Жим лёжа', 80), makeWorkout('e2', 'Присед', 100)],
    } as never);
    vi.mocked(exercisesApi.useClientExercises).mockReturnValue({
      isLoading: false,
      isError: false,
      isSuccess: true,
      data: [
        {
          id: 'e1',
          isGlobal: true,
          name: 'Жим лёжа',
          category: 'Грудь',
          subgroup: null,
          description: null,
          defaultReps: null,
          defaultWeightKg: null,
          defaultTimeSec: null,
          restSec: 90,
          note: null,
        },
        {
          id: 'e2',
          isGlobal: true,
          name: 'Присед',
          category: 'Ноги',
          subgroup: null,
          description: null,
          defaultReps: null,
          defaultWeightKg: null,
          defaultTimeSec: null,
          restSec: 90,
          note: null,
        },
      ],
    } as never);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Ноги' }));
    expect(screen.getByText('Присед')).toBeInTheDocument();
    expect(screen.queryByText('Жим лёжа')).not.toBeInTheDocument();
  });

  it('не привязан, пусто → приглашение подключить тренера', () => {
    mockMe(false);
    vi.mocked(workoutsApi.useClientWorkouts).mockReturnValue({
      isLoading: false,
      isError: false,
      isSuccess: true,
      data: [],
    } as never);
    vi.mocked(exercisesApi.useClientExercises).mockReturnValue({
      isLoading: false,
      isError: false,
      isSuccess: true,
      data: [],
    } as never);
    renderPage();
    expect(screen.getByText(/Подключите тренера/)).toBeInTheDocument();
  });
});
