import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ChatPage } from './ChatPage';
import * as auth from '../api/auth';
import * as chat from '../api/chat';

vi.mock('../api/auth');
vi.mock('../api/chat');

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
    vi.mocked(chat.useClientMessages).mockReturnValue({ data: [] } as never);
  });

  it('не привязан → приглашение подключить тренера', () => {
    mockMe(false);
    renderPage();
    expect(screen.getByText('Подключите тренера, чтобы написать ему.')).toBeInTheDocument();
  });

  it('привязан, показывает пузыри по ролям', () => {
    mockMe(true);
    vi.mocked(chat.useClientMessages).mockReturnValue({
      data: [
        { id: 'm1', senderRole: 'trainer', body: 'Привет', createdAt: '2026-06-03T08:00:00Z' },
        { id: 'm2', senderRole: 'client', body: 'Здравствуйте', createdAt: '2026-06-03T08:01:00Z' },
      ],
    } as never);
    renderPage();
    expect(screen.getByText('Привет')).toBeInTheDocument();
    expect(screen.getByText('Здравствуйте')).toBeInTheDocument();
  });

  it('отправка вызывает мутацию с body', () => {
    mockMe(true);
    renderPage();
    fireEvent.change(screen.getByPlaceholderText('Сообщение…'), { target: { value: 'Тест' } });
    fireEvent.click(screen.getByRole('button', { name: 'Отпр.' }));
    expect(sendMutate).toHaveBeenCalledWith({ body: 'Тест' }, expect.anything());
  });
});
