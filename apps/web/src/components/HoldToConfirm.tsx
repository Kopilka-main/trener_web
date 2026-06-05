import { useState, type ReactNode } from 'react';
import { ConfirmDialog } from './ConfirmDialog';

interface HoldToConfirmProps {
  onConfirm: () => void;
  /** Оставлено для совместимости вызовов — больше не используется. */
  durationMs?: number;
  label?: string;
  /** Иконка внутри кнопки. */
  children: ReactNode;
  disabled?: boolean;
  /** Размер кнопки: sm (h-8, по умолчанию) или md (h-10). */
  size?: 'sm' | 'md';
}

// Из подписи «Удерживайте, чтобы подтвердить» делаем вопрос и глагол для кнопки.
function parseLabel(label: string): { question: string; confirm: string } {
  const m = /^Удерживайте,\s*чтобы\s+(.+)$/i.exec(label);
  const action = (m?.[1] ?? label).trim();
  const question = `${action.charAt(0).toUpperCase()}${action.slice(1)}?`;
  const verb = action.split(' ')[0] ?? action;
  const confirm = `${verb.charAt(0).toUpperCase()}${verb.slice(1)}`;
  return { question, confirm };
}

/**
 * Круглая кнопка действия: тап (если не disabled) открывает всплывающее подтверждение.
 */
export function HoldToConfirm({
  onConfirm,
  label = 'Удерживайте, чтобы подтвердить',
  children,
  disabled = false,
  size = 'sm',
}: HoldToConfirmProps) {
  const [open, setOpen] = useState(false);
  const { question, confirm } = parseLabel(label);

  return (
    <>
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={`flex shrink-0 items-center justify-center rounded-full bg-card-elevated text-ink-muted disabled:opacity-40 ${
          size === 'md' ? 'h-10 w-10' : 'h-8 w-8'
        }`}
      >
        <span className="flex items-center justify-center">{children}</span>
      </button>
      {open && (
        <ConfirmDialog
          message={question}
          confirmLabel={confirm}
          onConfirm={() => {
            setOpen(false);
            onConfirm();
          }}
          onCancel={() => setOpen(false)}
        />
      )}
    </>
  );
}
