import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NotificationsPage } from './NotificationsPage';
import * as calendar from '../api/calendar';
import * as chat from '../api/chat';

vi.mock('../api/calendar');
vi.mock('../api/chat');

function renderPage() {
  return render(
    <MemoryRouter>
      <NotificationsPage />
    </MemoryRouter>,
  );
}

describe('NotificationsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    vi.mocked(chat.useMarkChatRead).mockReturnValue({ mutate: vi.fn() } as never);
  });

  it('пусто → «Уведомлений нет»', () => {
    vi.mocked(calendar.useClientSessions).mockReturnValue({ data: [] } as never);
    vi.mocked(chat.useClientChatUnread).mockReturnValue({ data: 0 } as never);
    renderPage();
    expect(screen.getByText('Уведомлений нет.')).toBeInTheDocument();
  });

  it('непрочитанные → карточка о сообщениях', () => {
    vi.mocked(calendar.useClientSessions).mockReturnValue({ data: [] } as never);
    vi.mocked(chat.useClientChatUnread).mockReturnValue({ data: 3 } as never);
    renderPage();
    expect(screen.getByText(/Новые сообщения от тренера/)).toBeInTheDocument();
  });
});
