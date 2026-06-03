import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ChatPage } from './ChatPage';
import * as auth from '../api/auth';
import * as chat from '../api/chat';
import * as trainerApi from '../api/trainer';

vi.mock('../api/auth');
vi.mock('../api/chat');
vi.mock('../api/trainer');

function mockMe(linked: boolean) {
  vi.mocked(auth.useClientMe).mockReturnValue({
    isLoading: false,
    data: {
      account: {
        id: 'ca1',
        email: 'a@b.co',
        firstName: 'И',
        lastName: 'К',
        avatarFileId: null,
        birthDate: null,
        contacts: [],
        bio: null,
      },
      link: linked ? { trainerId: 't1', clientId: 'cl1' } : null,
    },
  } as never);
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ChatPage />
    </MemoryRouter>,
  );
}

describe('ChatPage', () => {
  const sendMutate = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(chat.useMarkChatRead).mockReturnValue({ mutate: vi.fn() } as never);
    vi.mocked(chat.useSendClientMessage).mockReturnValue({
      mutate: sendMutate,
      isPending: false,
    } as never);
    vi.mocked(chat.useClientMessages).mockReturnValue({
      data: { messages: [], trainerLastReadAt: null },
    } as never);
    vi.mocked(trainerApi.useClientTrainer).mockReturnValue({ data: null } as never);
  });

  it('не привязан → приглашение подключить тренера', () => {
    mockMe(false);
    renderPage();
    expect(screen.getByText('Подключите тренера, чтобы написать ему.')).toBeInTheDocument();
  });

  it('шапка показывает имя тренера', () => {
    mockMe(true);
    vi.mocked(trainerApi.useClientTrainer).mockReturnValue({
      data: {
        id: 't1',
        firstName: 'Иван',
        lastName: 'Тренеров',
        title: null,
        bio: null,
        contacts: [],
      },
    } as never);
    renderPage();
    expect(screen.getByRole('heading', { name: 'Иван Тренеров' })).toBeInTheDocument();
  });

  it('своё сообщение отрисовано (прочитанное и новое)', () => {
    mockMe(true);
    vi.mocked(chat.useClientMessages).mockReturnValue({
      data: {
        messages: [
          {
            id: 'm1',
            senderRole: 'client',
            body: 'прочитанное',
            createdAt: '2026-06-03T08:00:00Z',
          },
          { id: 'm2', senderRole: 'client', body: 'новое', createdAt: '2026-06-03T09:00:00Z' },
        ],
        trainerLastReadAt: '2026-06-03T08:30:00Z',
      },
    } as never);
    renderPage();
    expect(screen.getByText('прочитанное')).toBeInTheDocument();
    expect(screen.getByText('новое')).toBeInTheDocument();
  });

  it('отправка вызывает мутацию с body', () => {
    mockMe(true);
    renderPage();
    fireEvent.change(screen.getByPlaceholderText('Сообщение…'), { target: { value: 'Тест' } });
    fireEvent.click(screen.getByRole('button', { name: 'Отпр.' }));
    expect(sendMutate).toHaveBeenCalledWith({ body: 'Тест' }, expect.anything());
  });
});
