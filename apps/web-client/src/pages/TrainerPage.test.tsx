import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrainerPage } from './TrainerPage';
import * as trainerApi from '../api/trainer';

vi.mock('../api/trainer');

describe('TrainerPage', () => {
  beforeEach(() => vi.resetAllMocks());

  it('показывает полную карточку тренера', () => {
    vi.mocked(trainerApi.useClientTrainer).mockReturnValue({
      isLoading: false,
      data: {
        id: 't1',
        firstName: 'Иван',
        lastName: 'Тренеров',
        title: 'Силовой тренер',
        bio: 'КМС по пауэрлифтингу',
        contacts: [{ type: 'Телефон', value: '+7 900 000-00-00' }],
      },
    } as never);
    render(<TrainerPage />);
    expect(screen.getByText('Иван Тренеров')).toBeInTheDocument();
    expect(screen.getByText('Силовой тренер')).toBeInTheDocument();
    expect(screen.getByText('КМС по пауэрлифтингу')).toBeInTheDocument();
    expect(screen.getByText('+7 900 000-00-00')).toBeInTheDocument();
  });

  it('нет тренера → «Тренер не подключён»', () => {
    vi.mocked(trainerApi.useClientTrainer).mockReturnValue({
      isLoading: false,
      data: null,
    } as never);
    render(<TrainerPage />);
    expect(screen.getByText('Тренер не подключён.')).toBeInTheDocument();
  });
});
