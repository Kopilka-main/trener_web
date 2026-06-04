import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProfilePage } from './ProfilePage';
import * as auth from '../api/auth';
import * as trainerApi from '../api/trainer';

vi.mock('../api/auth');
vi.mock('../api/trainer');

const account = {
  id: 'ca1',
  email: 'a@b.co',
  firstName: 'Иван',
  lastName: 'Петров',
  avatarFileId: null,
  birthDate: '1990-05-20',
  contacts: [{ type: 'Телефон', value: '+7900' }],
  bio: 'Цель — присед 100',
};

function renderPage() {
  return render(
    <MemoryRouter>
      <ProfilePage />
    </MemoryRouter>,
  );
}

describe('ProfilePage', () => {
  const mutate = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(auth.useClientLogout).mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
    vi.mocked(auth.useUpdateClientProfile).mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
    } as never);
    vi.mocked(auth.useUploadMyAvatar).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never);
    vi.mocked(auth.useRemoveMyAvatar).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never);
    vi.mocked(trainerApi.useClientTrainer).mockReturnValue({ data: null } as never);
  });

  it('показывает значения профиля и кнопку «Выйти»', () => {
    vi.mocked(auth.useClientMe).mockReturnValue({
      isLoading: false,
      data: { account, link: { trainerId: 't1', clientId: 'cl1' } },
    } as never);
    vi.mocked(trainerApi.useClientTrainer).mockReturnValue({
      data: {
        id: 't1',
        firstName: 'Иван',
        lastName: 'Тренеров',
        title: 'Силовой',
        bio: null,
        contacts: [],
      },
    } as never);
    renderPage();
    expect(screen.getByDisplayValue('Иван')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Цель — присед 100')).toBeInTheDocument();
    expect(screen.getByText('Ваш тренер')).toBeInTheDocument();
    expect(screen.getByText('Иван Тренеров')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument();
  });

  it('не подключён → ссылка «Подключить тренера»', () => {
    vi.mocked(auth.useClientMe).mockReturnValue({
      isLoading: false,
      data: { account: { ...account, contacts: [] }, link: null },
    } as never);
    renderPage();
    expect(screen.getByText('Подключить тренера')).toBeInTheDocument();
  });

  it('«Сохранить» вызывает мутацию с payload', () => {
    vi.mocked(auth.useClientMe).mockReturnValue({
      isLoading: false,
      data: { account, link: null },
    } as never);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: 'Иван', bio: 'Цель — присед 100' }),
      expect.anything(),
    );
  });
});
