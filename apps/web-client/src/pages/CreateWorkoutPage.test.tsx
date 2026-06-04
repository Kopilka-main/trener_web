import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CreateWorkoutPage } from './CreateWorkoutPage';
import type { ExerciseResponse } from '@trener/shared';
import * as exercisesApi from '../api/exercises';
import * as workoutsApi from '../api/workouts';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('../api/exercises');
vi.mock('../api/workouts');

function exercise(over: Partial<ExerciseResponse> = {}): ExerciseResponse {
  return {
    id: 'e1',
    isGlobal: true,
    name: 'Жим лёжа',
    category: 'Грудь',
    subgroup: null,
    description: null,
    defaultReps: 10,
    defaultWeightKg: 50,
    defaultTimeSec: null,
    restSec: 90,
    note: null,
    ...over,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <CreateWorkoutPage />
    </MemoryRouter>,
  );
}

describe('CreateWorkoutPage', () => {
  beforeEach(() => vi.resetAllMocks());

  it('выбор из каталога → «Создать» вызывает useCreateWorkout с планом', () => {
    vi.mocked(exercisesApi.useClientExercises).mockReturnValue({
      data: [exercise({ id: 'e1', name: 'Жим лёжа', defaultReps: 10, defaultWeightKg: 50 })],
      isLoading: false,
      isError: false,
      isSuccess: true,
    } as never);

    const createMutate = vi.fn();
    vi.mocked(workoutsApi.useCreateWorkout).mockReturnValue({
      mutate: createMutate,
      isPending: false,
    } as never);
    vi.mocked(workoutsApi.useStartWorkout).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never);

    renderPage();

    // Кнопка создания неактивна без упражнений.
    const createBtn = screen.getByRole('button', { name: /Создать и начать/ });
    expect(createBtn).toBeDisabled();

    // Добавляем упражнение из каталога.
    fireEvent.click(screen.getByText('Жим лёжа'));

    expect(createBtn).toBeEnabled();
    fireEvent.click(createBtn);

    expect(createMutate).toHaveBeenCalledTimes(1);
    const [payload] = createMutate.mock.calls[0] as [
      {
        name: string;
        exercises: {
          exerciseId: string;
          sets: { plannedReps?: number; plannedWeightKg?: number }[];
        }[];
      },
    ];
    expect(payload.name).toBe('Моя тренировка');
    expect(payload.exercises).toHaveLength(1);
    const planned = payload.exercises[0];
    expect(planned?.exerciseId).toBe('e1');
    expect(planned?.sets).toHaveLength(3); // дефолт 3 подхода
    expect(planned?.sets[0]).toEqual({ plannedReps: 10, plannedWeightKg: 50 });
  });
});
