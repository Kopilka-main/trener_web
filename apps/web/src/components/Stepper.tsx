import { Minus, Plus } from 'lucide-react';

interface StepperProps {
  value: number | null;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  unit?: string;
  label?: string;
}

/** Карточка-счётчик: − значение + с подписью. 0 трактуется как «не задано». */
export function Stepper({ value, onChange, step = 1, min = 0, unit, label }: StepperProps) {
  const v = value ?? 0;
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl bg-card px-2 py-3">
      <div className="flex w-full items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Меньше"
          onClick={() => onChange(Math.max(min, Math.round((v - step) * 100) / 100))}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chip text-ink active:scale-95"
        >
          <Minus size={16} />
        </button>
        <div className="flex flex-1 items-baseline justify-center gap-1.5">
          <span className="font-mono text-2xl font-bold tabular-nums text-ink">{v}</span>
          {unit && <span className="text-xs text-ink-muted">{unit}</span>}
        </div>
        <button
          type="button"
          aria-label="Больше"
          onClick={() => onChange(Math.round((v + step) * 100) / 100)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chip text-ink active:scale-95"
        >
          <Plus size={16} />
        </button>
      </div>
      {label && (
        <div className="text-center font-mono text-[11px] uppercase tracking-wide text-ink-muted">
          {label}
        </div>
      )}
    </div>
  );
}
