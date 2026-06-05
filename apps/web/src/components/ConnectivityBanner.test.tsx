import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ConnectivityBanner } from './ConnectivityBanner';
import { markOffline, markOnline } from '../lib/connectivity';

describe('ConnectivityBanner', () => {
  beforeEach(() => {
    // Сброс к «online» между тестами (стор — синглтон).
    markOnline();
  });

  it('при наличии связи плашки нет', () => {
    render(<ConnectivityBanner />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('потеря связи → янтарная плашка «проверьте интернет»', () => {
    render(<ConnectivityBanner />);
    act(() => markOffline());
    expect(screen.getByText(/Проверьте интернет/)).toBeInTheDocument();
  });

  it('восстановление → плашка «восстановлено», затем скрывается', () => {
    vi.useFakeTimers();
    render(<ConnectivityBanner />);
    act(() => markOffline());
    act(() => markOnline());
    expect(screen.getByText(/восстановлено/)).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(screen.queryByText(/восстановлено/)).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});
