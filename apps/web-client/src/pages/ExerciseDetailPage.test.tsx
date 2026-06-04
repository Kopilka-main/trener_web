import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ExerciseDetailPage } from './ExerciseDetailPage';
import * as workoutsApi from '../api/workouts';
import * as exercisesApi from '../api/exercises';

vi.mock('../api/workouts');
vi.mock('../api/exercises');

const workout = {
  id: 'w1',
  clientId: 'c1',
  name: 'Грудь',
  status: 'completed',
  startedAt: null,
  completedAt: '2026-06-03T08:30:00Z',
  durationSec: 3600,
  trainerNote: null,
  rpe: null,
  exercises: [
    {
      position: 0,
      exerciseId: 'e1',
      exerciseName: 'Жим лёжа',
      sets: [
        {
          setIndex: 0,
          plannedReps: 10,
          plannedWeightKg: 80,
          plannedTimeSec: null,
          plannedRestSec: null,
          actualReps: 10,
          actualWeightKg: 90,
          actualTimeSec: null,
          done: true,
        },
      ],
    },
  ],
};

function renderAt(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/knowledge/${id}`]}>
      <Routes>
        <Route path="/knowledge/:exerciseId" element={<ExerciseDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ExerciseDetailPage', () => {
  beforeEach(() => {
    vi.mocked(workoutsApi.useClientWorkouts).mockReturnValue({
      isLoading: false,
      isError: false,
      isSuccess: true,
      data: [workout],
    } as never);
  });

  it('показывает описание, параметры и результат из каталога', () => {
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
          description: 'Базовое упражнение на грудные мышцы.',
          defaultReps: 10,
          defaultWeightKg: 60,
          defaultTimeSec: null,
          restSec: 90,
          note: null,
        },
      ],
    } as never);
    renderAt('e1');

    expect(screen.getByRole('heading', { name: 'Жим лёжа' })).toBeInTheDocument();
    expect(screen.getByText('Грудь · Середина')).toBeInTheDocument();
    expect(screen.getByText('Базовое упражнение на грудные мышцы.')).toBeInTheDocument();
    expect(screen.getByText('Повторы')).toBeInTheDocument();
    expect(screen.getByText('PR вес')).toBeInTheDocument();
    expect(screen.getByText('90 кг')).toBeInTheDocument();
  });

  it('«Описание не задано», когда нет записи в каталоге', () => {
    vi.mocked(exercisesApi.useClientExercises).mockReturnValue({
      isLoading: false,
      isError: false,
      isSuccess: true,
      data: [],
    } as never);
    renderAt('e1');

    // Название берётся из охвата тренировок.
    expect(screen.getByRole('heading', { name: 'Жим лёжа' })).toBeInTheDocument();
    expect(screen.getByText('Описание не задано')).toBeInTheDocument();
  });
});
