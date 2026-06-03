import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

interface StepperProps {
  value: number | null;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  label?: string;
}

/** Карточка-счётчик: − значение + с подписью. Значение можно вводить с клавиатуры. */
export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 100000,
  unit,
  label,
}: StepperProps) {
  const v = value ?? 0;
  // Локальная строка ввода — синхронизируется с внешним value, пока поле не в фокусе.
  const [text, setText] = useState(() => String(v));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(String(v));
  }, [v, editing]);

  const clamp = (n: number) => Math.max(min, Math.min(max, Math.round(n * 100) / 100));

  function commit(raw: string) {
    const n = Number(raw.replace(',', '.'));
    onChange(raw.trim() === '' || !Number.isFinite(n) ? min : clamp(n));
  }

  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl bg-card px-2 py-3">
      <div className="flex w-full items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Меньше"
          onClick={() => onChange(clamp(v - step))}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chip text-ink active:scale-95"
        >
          <Minus size={16} />
        </button>
        <div className="flex min-w-0 flex-1 items-baseline justify-center gap-1.5">
          <input
            type="text"
            inputMode="decimal"
            value={text}
            aria-label={label ?? 'Значение'}
            onFocus={(e) => {
              setEditing(true);
              e.target.select();
            }}
            onChange={(e) => setText(e.target.value.replace(/[^0-9.,]/g, ''))}
            onBlur={() => {
              setEditing(false);
              commit(text);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            className="w-full min-w-0 bg-transparent text-center font-mono text-2xl font-bold tabular-nums text-ink outline-none"
          />
          {unit && <span className="shrink-0 text-xs text-ink-muted">{unit}</span>}
        </div>
        <button
          type="button"
          aria-label="Больше"
          onClick={() => onChange(clamp(v + step))}
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
