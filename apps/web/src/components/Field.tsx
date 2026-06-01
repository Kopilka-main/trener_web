import type { InputHTMLAttributes } from 'react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function Field({ label, id, className = '', ...rest }: FieldProps) {
  const inputId = id ?? rest.name;
  return (
    <label htmlFor={inputId} className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        id={inputId}
        className={`rounded-xl border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-slate-500 ${className}`}
        {...rest}
      />
    </label>
  );
}
