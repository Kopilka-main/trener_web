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

function makeWorkout(exerciseId: string, name: string, weight: number, workoutName = 'Тренировка') {
  return {
    id: `w-${exerciseId}`,
    clientId: 'c1',
    name: workoutName,
    status: 'completed',
    startedAt: null,
    completedAt: '2026-06-03T08:30:00Z',
    durationSec: 3600,
    trainerNote: null,
    rpe: null,
    createdByClient: false,
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

function exercise(id: string, name: string, category: string, subgroup: string | null) {
  return {
    id,
    isGlobal: true,
    name,
    category,
    subgroup,
    description: null,
    defaultReps: null,
    defaultWeightKg: null,
    defaultTimeSec: null,
    restSec: 90,
    note: null,
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

function mockData(
  workouts: ReturnType<typeof makeWorkout>[],
  exercises: ReturnType<typeof exercise>[],
) {
  vi.mocked(workoutsApi.useClientWorkouts).mockReturnValue({
    isLoading: false,
    isError: false,
    isSuccess: true,
    data: workouts,
  } as never);
  vi.mocked(exercisesApi.useClientExercises).mockReturnValue({
    isLoading: false,
    isError: false,
    isSuccess: true,
    data: exercises,
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

  it('по умолчанию — вкладка «Тренировки» с проведёнными тренером', () => {
    mockMe(true);
    mockData(
      [makeWorkout('e1', 'Жим лёжа', 80, 'Push — грудь')],
      [exercise('e1', 'Жим лёжа', 'Грудь', 'Середина')],
    );
    renderPage();
    expect(screen.getByText('Push — грудь')).toBeInTheDocument();
    // Упражнения скрыты, пока не переключишь вкладку.
    expect(screen.queryByText('Грудь · Середина')).not.toBeInTheDocument();
  });

  it('вкладка «Упражнения»: список из охвата, обогащённый каталогом', () => {
    mockMe(true);
    mockData(
      [makeWorkout('e1', 'Жим лёжа', 80), makeWorkout('e2', 'Присед', 100)],
      [exercise('e1', 'Жим лёжа', 'Грудь', 'Середина'), exercise('e2', 'Присед', 'Ноги', null)],
    );
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Упражнения' }));
    expect(screen.getByText('Жим лёжа')).toBeInTheDocument();
    expect(screen.getByText('Присед')).toBeInTheDocument();
    expect(screen.getByText('Грудь · Середина')).toBeInTheDocument();
  });

  it('фильтрует упражнения по выбранной группе мышц', () => {
    mockMe(true);
    mockData(
      [makeWorkout('e1', 'Жим лёжа', 80), makeWorkout('e2', 'Присед', 100)],
      [exercise('e1', 'Жим лёжа', 'Грудь', null), exercise('e2', 'Присед', 'Ноги', null)],
    );
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Упражнения' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ноги' }));
    expect(screen.getByText('Присед')).toBeInTheDocument();
    expect(screen.queryByText('Жим лёжа')).not.toBeInTheDocument();
  });

  it('не привязан, пусто → приглашение подключить тренера', () => {
    mockMe(false);
    mockData([], []);
    renderPage();
    expect(screen.getByText(/Подключите тренера/)).toBeInTheDocument();
  });
});
