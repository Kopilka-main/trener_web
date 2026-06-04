import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RunWorkoutPage } from './RunWorkoutPage';
import type { WorkoutResponse } from '@trener/shared';
import * as workoutsApi from '../api/workouts';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('../api/workouts');

function activeWorkout(): WorkoutResponse {
  return {
    id: 'w1',
    clientId: 'c1',
    name: 'Моя тренировка',
    status: 'active',
    startedAt: '2026-06-04T08:00:00Z',
    completedAt: null,
    durationSec: null,
    trainerNote: null,
    rpe: null,
    createdByClient: true,
    exercises: [
      {
        position: 2,
        exerciseId: 'e1',
        exerciseName: 'Жим лёжа',
        sets: [
          {
            setIndex: 0,
            plannedReps: 10,
            plannedWeightKg: 50,
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
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/workouts/w1/run']}>
      <Routes>
        <Route path="/workouts/:wid/run" element={<RunWorkoutPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RunWorkoutPage', () => {
  beforeEach(() => vi.resetAllMocks());

  it('лог подхода → useUpdateWorkoutSet с составным setId "<position>:<setIndex>"', () => {
    vi.mocked(workoutsApi.useClientWorkout).mockReturnValue({
      data: activeWorkout(),
      isLoading: false,
      isError: false,
      isSuccess: true,
    } as never);
    const updateMutate = vi.fn();
    vi.mocked(workoutsApi.useUpdateWorkoutSet).mockReturnValue({
      mutate: updateMutate,
      isPending: false,
    } as never);
    vi.mocked(workoutsApi.useCompleteWorkout).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never);

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Готово' }));

    expect(updateMutate).toHaveBeenCalledTimes(1);
    const [arg] = updateMutate.mock.calls[0] as [
      {
        wid: string;
        setId: string;
        input: { done: boolean; actualReps: number | null; actualWeightKg: number | null };
      },
    ];
    expect(arg.wid).toBe('w1');
    expect(arg.setId).toBe('2:0'); // position 2, setIndex 0
    expect(arg.input.done).toBe(true);
    expect(arg.input.actualReps).toBe(10); // префилл из плана
    expect(arg.input.actualWeightKg).toBe(50);
  });

  it('завершение вызывает useCompleteWorkout и навигацию на деталь', () => {
    vi.mocked(workoutsApi.useClientWorkout).mockReturnValue({
      data: activeWorkout(),
      isLoading: false,
      isError: false,
      isSuccess: true,
    } as never);
    vi.mocked(workoutsApi.useUpdateWorkoutSet).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never);
    const completeMutate = vi.fn((_vars, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
    vi.mocked(workoutsApi.useCompleteWorkout).mockReturnValue({
      mutate: completeMutate,
      isPending: false,
    } as never);

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Завершить тренировку' }));

    expect(completeMutate).toHaveBeenCalledTimes(1);
    const [vars] = completeMutate.mock.calls[0] as [{ wid: string; input: { rpe: number | null } }];
    expect(vars.wid).toBe('w1');
    expect(navigate).toHaveBeenCalledWith('/workouts/w1');
  });

  it('не active → сообщение и ссылка назад', () => {
    vi.mocked(workoutsApi.useClientWorkout).mockReturnValue({
      data: { ...activeWorkout(), status: 'completed' },
      isLoading: false,
      isError: false,
      isSuccess: true,
    } as never);
    vi.mocked(workoutsApi.useUpdateWorkoutSet).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never);
    vi.mocked(workoutsApi.useCompleteWorkout).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never);

    renderPage();

    expect(screen.getByText(/не запущена/)).toBeInTheDocument();
  });
});
