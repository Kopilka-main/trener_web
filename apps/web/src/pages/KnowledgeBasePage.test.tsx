import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ExerciseResponse, TemplateResponse } from '@trener/shared';
import { useExercises } from '../api/exercises';
import { useTemplates } from '../api/workout-templates';
import { KnowledgeBasePage } from './KnowledgeBasePage';

vi.mock('../api/exercises', () => ({ useExercises: vi.fn() }));
vi.mock('../api/workout-templates', () => ({ useTemplates: vi.fn() }));

const exercises: ExerciseResponse[] = [
  {
    id: 'ex1',
    isGlobal: true,
    name: 'Присед со штангой',
    category: 'Ноги',
    description: null,
    defaultReps: null,
    defaultWeightKg: null,
    defaultTimeSec: null,
    restSec: 90,
    note: null,
  },
];

const templates: TemplateResponse[] = [
  {
    id: 'tpl1',
    name: 'Программа ног',
    categoryTag: 'силовая',
    exercises: [
      {
        position: 0,
        exerciseId: 'ex1',
        exerciseName: 'Присед со штангой',
        sets: 3,
        reps: 10,
        weightKg: null,
        timeSec: null,
        restSec: 90,
      },
    ],
  },
];

function mockExercises(data: ExerciseResponse[]) {
  vi.mocked(useExercises).mockReturnValue({
    data,
    isPending: false,
    isError: false,
    isSuccess: true,
  } as unknown as ReturnType<typeof useExercises>);
}

function mockTemplates(data: TemplateResponse[]) {
  vi.mocked(useTemplates).mockReturnValue({
    data,
    isPending: false,
    isError: false,
    isSuccess: true,
  } as unknown as ReturnType<typeof useTemplates>);
}

function renderPage() {
  return render(
    <MemoryRouter>
      <KnowledgeBasePage />
    </MemoryRouter>,
  );
}

describe('KnowledgeBasePage', () => {
  it('рендерит список упражнений с бейджем глобального', () => {
    mockExercises(exercises);
    mockTemplates(templates);
    renderPage();

    expect(screen.getByText('Присед со штангой')).toBeInTheDocument();
    expect(screen.getByText('Глобальное')).toBeInTheDocument();
  });

  it('переключение на таб «Шаблоны» показывает шаблоны', () => {
    mockExercises(exercises);
    mockTemplates(templates);
    renderPage();

    expect(screen.queryByText('Программа ног')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Шаблоны' }));

    expect(screen.getByText('Программа ног')).toBeInTheDocument();
    expect(screen.getByText('1 упр.')).toBeInTheDocument();
  });
});
