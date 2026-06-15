import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomePage } from './HomePage';
import * as auth from '../api/auth';
import * as trainerApi from '../api/trainer';
import * as calendar from '../api/calendar';
import * as workouts from '../api/workouts';
import * as chat from '../api/chat';
import * as measurements from '../api/measurements';
import * as packages from '../api/packages';

vi.mock('../api/auth');
vi.mock('../api/trainer');
vi.mock('../api/calendar');
vi.mock('../api/workouts');
vi.mock('../api/chat');
vi.mock('../api/measurements');
vi.mock('../api/packages');

function setup(opts: {
  linked: boolean;
  sessions?: unknown[];
  unread?: number;
  workouts?: unknown[];
  measurements?: unknown[];
  trainer?: { firstName: string; lastName: string } | null;
}) {
  vi.mocked(auth.useClientMe).mockReturnValue({
    isLoading: false,
    data: {
      account: {
        id: 'ca1',
        email: 'a@b.co',
        firstName: 'Иван',
        lastName: 'Клиент',
        avatarFileId: null,
      },
      link: opts.linked ? { trainerId: 't1', clientId: 'cl1' } : null,
    },
  } as never);
  vi.mocked(trainerApi.useClientTrainer).mockReturnValue({ data: opts.trainer ?? null } as never);
  vi.mocked(calendar.useClientSessions).mockReturnValue({ data: opts.sessions ?? [] } as never);
  vi.mocked(workouts.useClientWorkouts).mockReturnValue({ data: opts.workouts ?? [] } as never);
  vi.mocked(chat.useClientChatUnread).mockReturnValue({ data: opts.unread ?? 0 } as never);
  vi.mocked(chat.useClientMessages).mockReturnValue({ data: { messages: [] } } as never);
  vi.mocked(measurements.useClientMeasurements).mockReturnValue({
    data: opts.measurements ?? [],
  } as never);
  vi.mocked(packages.useClientPackages).mockReturnValue({ data: [] } as never);
}

function renderPage() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

describe('HomePage (client)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
  });

  it('привязан: показывает герой-число и плитки', () => {
    setup({
      linked: true,
      sessions: [
        {
          id: 's1',
          clientId: 'cl1',
          workoutId: null,
          date: '2999-01-01',
          startTime: '10:00',
          durationMin: 60,
          location: null,
          title: 'Силовая',
          status: 'planned',
          isOnline: false,
          note: null,
          clientConfirmation: 'confirmed',
        },
      ],
      workouts: [{ id: 'w1' }, { id: 'w2' }],
      measurements: [{ id: 'm1' }],
    });
    renderPage();
    expect(screen.getByText('Тренировки')).toBeInTheDocument();
    expect(screen.getByText('Календарь')).toBeInTheDocument();
    expect(screen.getByText('Прогресс')).toBeInTheDocument();
    expect(screen.getByText('Уведомления')).toBeInTheDocument();
    expect(screen.queryByText('Профиль')).not.toBeInTheDocument();
    // метрика завершённых тренировок = 02
    expect(screen.getByText('02')).toBeInTheDocument();
  });

  it('не привязан: показывает CTA «Подключите тренера»', () => {
    setup({ linked: false });
    renderPage();
    expect(screen.getByText('Подключите тренера')).toBeInTheDocument();
  });

  it('есть непрочитанные → плитка «Чат» primary (acid-fill)', () => {
    setup({ linked: true, unread: 3 });
    renderPage();
    const tile = screen.getByText('Чат').closest('button');
    expect(tile?.className).toContain('tile-shadow-primary');
  });
});
