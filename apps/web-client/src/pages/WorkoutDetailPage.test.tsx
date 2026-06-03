import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { WorkoutDetailPage } from './WorkoutDetailPage';
import * as api from '../api/workouts';

vi.mock('../api/workouts');

const workout = {
  id: 'w2',
  clientId: 'c1',
  name: 'Ноги',
  status: 'completed',
  startedAt: null,
  completedAt: '2026-06-03T08:30:00Z',
  durationSec: 1800,
  trainerNote: 'Хорошая работа',
  rpe: 8,
  exercises: [
    {
      position: 0,
      exerciseId: 'e1',
      exerciseName: 'Присед',
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

function renderAt() {
  return render(
    <MemoryRouter initialEntries={['/workouts/w2']}>
      <Routes>
        <Route path="/workouts/:wid" element={<WorkoutDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('WorkoutDetailPage', () => {
  beforeEach(() => {
    vi.mocked(api.useClientWorkout).mockReturnValue({
      isLoading: false,
      isError: false,
      data: workout,
    } as never);
    vi.mocked(api.useClientWorkouts).mockReturnValue({
      isLoading: false,
      isError: false,
      data: [workout],
    } as never);
  });

  it('показывает упражнение, факт и бейдж рекорда', () => {
    renderAt();
    expect(screen.getByText('Присед')).toBeInTheDocument();
    expect(screen.getByText('10 × 90 кг')).toBeInTheDocument();
    expect(screen.getByText('рекорд')).toBeInTheDocument();
    expect(screen.getByText('Хорошая работа')).toBeInTheDocument();
  });
});
