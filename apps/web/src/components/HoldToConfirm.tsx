import { useRef, useState, type ReactNode } from 'react';

interface HoldToConfirmProps {
  onConfirm: () => void;
  /** Сколько держать до срабатывания, мс. */
  durationMs?: number;
  label?: string;
  /** Иконка внутри кнопки. */
  children: ReactNode;
  disabled?: boolean;
  /** Размер кнопки: sm (h-8, по умолчанию) или md (h-10). */
  size?: 'sm' | 'md';
}

/**
 * Круглая кнопка действия «по удержанию»: при нажатии кольцо заполняется
 * акцентным цветом за durationMs, по завершении — onConfirm. Отпустил раньше — отмена.
 */
export function HoldToConfirm({
  onConfirm,
  durationMs = 1500,
  label = 'Удерживайте, чтобы подтвердить',
  children,
  disabled = false,
  size = 'sm',
}: HoldToConfirmProps) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | null>(null);

  function clear() {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }

  function start() {
    if (disabled) return;
    setHolding(true);
    clear();
    timer.current = window.setTimeout(() => {
      setHolding(false);
      timer.current = null;
      onConfirm();
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
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative flex shrink-0 touch-none select-none items-center justify-center rounded-full bg-card-elevated disabled:opacity-40 ${
        size === 'md' ? 'h-10 w-10' : 'h-8 w-8'
      } ${holding ? 'text-accent' : 'text-ink-muted'}`}
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
          stroke="var(--color-accent)"
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
      <span className="relative z-10 flex items-center justify-center">{children}</span>
    </button>
  );
}
