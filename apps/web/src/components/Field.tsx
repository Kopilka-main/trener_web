import type { InputHTMLAttributes } from 'react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Текст ошибки: подсвечивает рамку красным и показывает подпись снизу. */
  error?: string;
}

export function Field({ label, id, error, className = '', ...rest }: FieldProps) {
  const inputId = id ?? rest.name;
  return (
    <label htmlFor={inputId} className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink-muted">{label}</span>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        className={`rounded-xl border bg-chip px-3 py-2.5 text-base text-ink outline-none placeholder:text-ink-mutedxl focus:border-accent ${
          error ? 'border-danger' : 'border-line'
        } ${className}`}
        {...rest}
      />
      {error && <span className="text-[12px] text-danger">{error}</span>}
    </label>
  );
}
