import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/workouts/w1/run']}>
        <Routes>
          <Route path="/workouts/:wid/run" element={<RunWorkoutPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RunWorkoutPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Хуки правки набора вызываются на верхнем уровне — мокаем по умолчанию.
    vi.mocked(workoutsApi.useAddWorkoutExercise).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never);
    vi.mocked(workoutsApi.useRemoveWorkoutExercise).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never);
    vi.mocked(workoutsApi.useReorderWorkoutExercises).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never);
    vi.mocked(workoutsApi.useDeleteWorkout).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never);
    vi.mocked(workoutsApi.clientWorkoutQueryKey).mockImplementation(
      (wid: string) => ['client', 'workouts', wid] as never,
    );
  });

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

    fireEvent.click(screen.getByRole('button', { name: 'Отметить выполненным' }));

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

  it('удержание «Завершить» вызывает useCompleteWorkout и навигацию на деталь', () => {
    vi.useFakeTimers();
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

    // Завершение — удержанием 1с (HoldComplete).
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Удерживайте, чтобы завершить' }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(completeMutate).toHaveBeenCalledTimes(1);
    const [vars] = completeMutate.mock.calls[0] as [
      { wid: string; input: { rpe: number | null; durationSec: number | null } },
    ];
    expect(vars.wid).toBe('w1');
    expect(navigate).toHaveBeenCalledWith('/workouts/w1');
    vi.useRealTimers();
  });

  it('завершённая → редирект на итоги, без промежуточного экрана', () => {
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

    // Промежуточный экран «уже завершена» убран — идёт редирект на /workouts/:id.
    expect(screen.queryByText(/уже завершена/)).not.toBeInTheDocument();
  });

  it('черновик → форма плана с «Начать тренировку»', () => {
    vi.mocked(workoutsApi.useClientWorkout).mockReturnValue({
      data: { ...activeWorkout(), status: 'draft' },
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
    const startMutate = vi.fn();
    vi.mocked(workoutsApi.useStartWorkout).mockReturnValue({
      mutate: startMutate,
      isPending: false,
    } as never);

    renderPage();

    expect(screen.getByText(/План тренировки/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Начать тренировку' }));
    expect(startMutate).toHaveBeenCalledWith('w1', expect.anything());
  });
});
