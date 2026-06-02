import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';

interface ScreenHeaderProps {
  title: ReactNode;
  /**
   * Куда вести «назад». Строка — конкретный маршрут (replace по истории),
   * функция — кастомный обработчик, по умолчанию — шаг назад по истории.
   */
  back?: string | (() => void);
  /** Опциональный слот действия справа (например, кнопка сохранения). */
  right?: ReactNode;
}

/** Заголовок внутреннего экрана: кнопка «назад» + центрированный title + опц. действие. */
export function ScreenHeader({ title, back, right }: ScreenHeaderProps) {
  const navigate = useNavigate();

  function handleBack() {
    if (typeof back === 'function') {
      back();
    } else if (typeof back === 'string') {
      void navigate(back);
    } else {
      void navigate(-1);
    }
  }

  return (
    <header className="grid grid-cols-[44px_1fr_44px] items-center px-3 py-3">
      <button
        type="button"
        onClick={handleBack}
        aria-label="Назад"
        className="flex h-9 w-9 items-center justify-center rounded-full text-ink active:bg-card-elevated"
      >
        <ChevronLeft size={22} strokeWidth={1.8} />
      </button>
      <h1 className="truncate text-center text-[15px] font-semibold text-ink">{title}</h1>
      <div className="flex justify-end">{right}</div>
    </header>
  );
}
