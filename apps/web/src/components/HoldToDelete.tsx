import { useRef, useState } from 'react';
import { X } from 'lucide-react';

interface HoldToDeleteProps {
  onDelete: () => void;
  /** Сколько держать до удаления, мс. */
  durationMs?: number;
  label?: string;
}

/**
 * Круглая кнопка удаления «по удержанию»: при нажатии кружок заполняется
 * красным за durationMs, по завершении — onDelete. Отпустил раньше — отмена.
 */
export function HoldToDelete({
  onDelete,
  durationMs = 1100,
  label = 'Удерживайте, чтобы убрать',
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

  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      className="relative flex h-8 w-8 shrink-0 touch-none select-none items-center justify-center overflow-hidden rounded-full bg-card-elevated text-ink-muted"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full bg-danger ease-linear"
        style={{
          transform: holding ? 'scale(1)' : 'scale(0)',
          transitionProperty: 'transform',
          transitionDuration: holding ? `${String(durationMs)}ms` : '160ms',
        }}
      />
      <X size={16} className={`relative z-10 ${holding ? 'text-white' : ''}`} />
    </button>
  );
}
