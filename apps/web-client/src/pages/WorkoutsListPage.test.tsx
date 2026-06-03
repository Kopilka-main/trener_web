import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WorkoutsListPage } from './WorkoutsListPage';
import * as api from '../api/workouts';

vi.mock('../api/workouts');

function renderPage() {
  return render(
    <MemoryRouter>
      <WorkoutsListPage />
    </MemoryRouter>,
  );
}

describe('WorkoutsListPage', () => {
  beforeEach(() => vi.resetAllMocks());

  it('пустое состояние', () => {
    vi.mocked(api.useClientWorkouts).mockReturnValue({
      isLoading: false,
      isError: false,
      data: [],
    } as never);
    renderPage();
    expect(screen.getByText('Пока нет завершённых тренировок.')).toBeInTheDocument();
  });

  it('показывает карточку тренировки', () => {
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
