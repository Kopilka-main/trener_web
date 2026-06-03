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
  /** Опциональный слот действия справа (например, кнопка сохранения). */
  right?: ReactNode;
}

/** Заголовок внутреннего экрана: центрированный title + опц. действие справа. */
export function ScreenHeader({ title, right }: ScreenHeaderProps) {
  return (
    <header className="relative flex min-h-[56px] items-center px-14 py-3">
      <h1 className="mx-auto truncate text-center text-[15px] font-semibold text-ink">{title}</h1>
      {right && <div className="absolute right-3 flex items-center">{right}</div>}
    </header>
  );
}
