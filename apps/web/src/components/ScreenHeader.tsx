import type { ReactNode } from 'react';

interface ScreenHeaderProps {
  title: ReactNode;
  /**
   * Куда вести «назад» — сохранено для совместимости с вызовами. Навигация
   * назад теперь выполняется глобальной плавающей кнопкой BackFab, поэтому
   * в самом заголовке кнопки нет.
   */
  back?: string | (() => void);
  /** Сохранено для совместимости (раньше — крестик ✕ в шапке мастеров). */
  closeIcon?: boolean;
  /** Опциональный слот действия слева (например, «Отмена»). */
  left?: ReactNode;
  /** Опциональный слот действия справа (например, кнопка сохранения). */
  right?: ReactNode;
  /** Закрепить шапку вверху экрана при прокрутке. */
  sticky?: boolean;
}

/** Заголовок внутреннего экрана: центрированный title + опц. действия слева/справа. */
export function ScreenHeader({ title, left, right, sticky = false }: ScreenHeaderProps) {
  return (
    <header
      className={`relative flex min-h-[56px] items-center px-14 py-3 ${
        sticky ? 'sticky top-0 z-20 bg-bg/95 backdrop-blur' : ''
      }`}
    >
      {left && <div className="absolute left-3 flex items-center">{left}</div>}
      <h1 className="mx-auto truncate text-center text-[15px] font-semibold text-ink">{title}</h1>
      {right && <div className="absolute right-3 flex items-center">{right}</div>}
    </header>
  );
}
