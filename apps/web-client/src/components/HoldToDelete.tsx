import { useRef, useState } from 'react';
import { Trash2, X } from 'lucide-react';

interface HoldToDeleteProps {
  onDelete: () => void;
  /** Сколько держать до удаления, мс. */
  durationMs?: number;
  label?: string;
  /** Иконка внутри: крестик (по умолчанию) или корзинка. */
  icon?: 'x' | 'trash';
  /** Размер кнопки: sm (h-8, по умолчанию) или md (h-9). */
  size?: 'sm' | 'md';
}

/**
 * Круглая кнопка удаления «по удержанию»: при нажатии кружок заполняется
 * красным за durationMs, по завершении — onDelete. Отпустил раньше — отмена.
 */
export function HoldToDelete({
  onDelete,
  durationMs = 1100,
  label = 'Удерживайте, чтобы убрать',
  icon = 'x',
  size = 'sm',
}: HoldToDeleteProps) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | null>(null);

  function clear() {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }

  function start() {
    setHolding(true);
    clear();
    timer.current = window.setTimeout(() => {
      setHolding(false);
      timer.current = null;
      onDelete();
    }, durationMs);
  }

  function cancel() {
    clear();
    setHolding(false);
  }

  const C = 2 * Math.PI * 16; // длина окружности (r=16 в системе координат 36×36)

  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative flex shrink-0 touch-none select-none items-center justify-center rounded-full bg-card-elevated ${
        size === 'md' ? 'h-10 w-10' : 'h-8 w-8'
      } ${holding ? 'text-danger' : 'text-ink-muted'}`}
    >
      {/* Кольцо-прогресс: заполняется по часовой за durationMs. */}
      <svg
        aria-hidden
        viewBox="0 0 36 36"
        className="pointer-events-none absolute inset-0 h-full w-full -rotate-90"
      >
        <circle
          cx="18"
          cy="18"
          r="16"
          fill="none"
          stroke="var(--color-danger)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={holding ? 0 : C}
          style={{
            transitionProperty: 'stroke-dashoffset',
            transitionTimingFunction: 'linear',
            transitionDuration: holding ? `${String(durationMs)}ms` : '160ms',
          }}
        />
      </svg>
      {icon === 'trash' ? (
        <Trash2 size={16} className="relative z-10" />
      ) : (
        <X size={16} className="relative z-10" />
      )}
    </button>
  );
}
