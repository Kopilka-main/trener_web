import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { WorkoutResponse } from '@trener/shared';
import { ClientWorkoutsPage } from './ClientWorkoutsPage';
import { useClientWorkouts, useCreateWorkout } from '../api/client-workouts';
import { useTemplates } from '../api/workout-templates';
import { useClient } from '../api/clients';

vi.mock('../api/client-workouts', () => ({
  useClientWorkouts: vi.fn(),
  useCreateWorkout: vi.fn(),
}));
vi.mock('../api/workout-templates', () => ({
  useTemplates: vi.fn(),
}));
vi.mock('../api/clients', () => ({
  useClient: vi.fn(),
}));

const mockedUseClientWorkouts = vi.mocked(useClientWorkouts);
const mockedUseCreateWorkout = vi.mocked(useCreateWorkout);
const mockedUseTemplates = vi.mocked(useTemplates);
const mockedUseClient = vi.mocked(useClient);

function workout(over: Partial<WorkoutResponse>): WorkoutResponse {
  return {
    id: 'w1',
    clientId: 'c1',
    name: 'Грудь и трицепс',
    status: 'completed',
    startedAt: '2026-05-01T10:00:00.000Z',
    completedAt: '2026-05-01T11:00:00.000Z',
    durationSec: 3600,
    trainerNote: null,
    rpe: 7,
    exercises: [],
    ...over,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/clients/c1/workouts']}>
      <Routes>
        <Route path="/clients/:id/workouts" element={<ClientWorkoutsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockedUseClientWorkouts.mockReset();
  mockedUseCreateWorkout.mockReset();
  mockedUseTemplates.mockReset();
  mockedUseClient.mockReset();
  mockedUseClient.mockReturnValue({
    data: undefined,
  } as unknown as ReturnType<typeof useClient>);
  mockedUseCreateWorkout.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useCreateWorkout>);
  mockedUseTemplates.mockReturnValue({
    data: [],
    isPending: false,
    isError: false,
    isSuccess: true,
  } as unknown as ReturnType<typeof useTemplates>);
});

describe('ClientWorkoutsPage', () => {
  it('рендерит историю тренировок из мока', () => {
    mockedUseClientWorkouts.mockReturnValue({
      data: [workout({ id: 'w1', name: 'Грудь и трицепс', status: 'completed' })],
      isPending: false,
      isError: false,
      isSuccess: true,
    } as unknown as ReturnType<typeof useClientWorkouts>);

    renderPage();

    expect(screen.getByText('Грудь и трицепс')).toBeInTheDocument();
    expect(screen.getByText(/История тренировок/)).toBeInTheDocument();
  });

  it('показывает пустое состояние без тренировок', () => {
    mockedUseClientWorkouts.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
      isSuccess: true,
    } as unknown as ReturnType<typeof useClientWorkouts>);

    renderPage();

    expect(screen.getByText('Тренировка не запланирована')).toBeInTheDocument();
  });
});
