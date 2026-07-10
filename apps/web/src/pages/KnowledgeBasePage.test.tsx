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
    subgroup: null,
    description: null,
    defaultReps: null,
    defaultWeightKg: null,
    defaultTimeSec: null,
    restSec: 90,
    note: null,
    imageUrl: null,
    thumbUrl: null,
    videoUrl: null,
    equipment: null,
    primaryMuscles: null,
    secondaryMuscles: null,
  },
];

const templates: TemplateResponse[] = [
  {
    id: 'tpl1',
    clientId: null,
    clientName: null,
    name: 'Программа ног',
    categoryTag: 'силовая',
    shortDescription: null,
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
  it('по умолчанию показывает список тренировок (шаблонов)', () => {
    mockExercises(exercises);
    mockTemplates(templates);
    renderPage();

    expect(screen.getByRole('heading', { name: 'База знаний' })).toBeInTheDocument();
    expect(screen.getByText('Программа ног')).toBeInTheDocument();
    expect(screen.getByText('силовая · 1 упр.')).toBeInTheDocument();
    // Упражнение из другой вкладки пока не отрисовано.
    expect(screen.queryByText('Присед со штангой')).not.toBeInTheDocument();
  });

  it('переключение на таб «Упражнения» показывает упражнения', () => {
    mockExercises(exercises);
    mockTemplates(templates);
    renderPage();

    fireEvent.click(screen.getByRole('tab', { name: /Упражнения/ }));

    expect(screen.getByText('Присед со штангой')).toBeInTheDocument();
  });

  it('фильтрует упражнения по чипу категории', () => {
    mockExercises([
      ...exercises,
      {
        id: 'ex2',
        isGlobal: false,
        name: 'Жим лёжа',
        category: 'Грудь',
        subgroup: null,
        description: null,
        defaultReps: null,
        defaultWeightKg: null,
        defaultTimeSec: null,
        restSec: 60,
        note: null,
        imageUrl: null,
        thumbUrl: null,
        videoUrl: null,
        equipment: null,
        primaryMuscles: null,
        secondaryMuscles: null,
      },
    ]);
    mockTemplates(templates);
    renderPage();

    fireEvent.click(screen.getByRole('tab', { name: /Упражнения/ }));
    expect(screen.getByText('Присед со штангой')).toBeInTheDocument();
    expect(screen.getByText('Жим лёжа')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Грудь' }));
    expect(screen.queryByText('Присед со штангой')).not.toBeInTheDocument();
    expect(screen.getByText('Жим лёжа')).toBeInTheDocument();
  });
});
