import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import * as chat from '../api/chat';

vi.mock('../api/chat');

function renderNav() {
  return render(
    <MemoryRouter>
      <BottomNav />
    </MemoryRouter>,
  );
}

describe('BottomNav', () => {
  beforeEach(() => vi.resetAllMocks());

  it('без непрочитанных — бейджа нет', () => {
    vi.mocked(chat.useClientChatUnread).mockReturnValue({ data: 0 } as never);
    renderNav();
    expect(screen.queryByText('3')).not.toBeInTheDocument();
    expect(screen.getByText('Чат')).toBeInTheDocument();
  });

  it('есть непрочитанные — показывает счётчик', () => {
    vi.mocked(chat.useClientChatUnread).mockReturnValue({ data: 3 } as never);
    renderNav();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
