import { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';

interface HoldToDeleteProps {
  onDelete: () => void;
  /** Оставлено для совместимости вызовов — больше не используется. */
  durationMs?: number;
  label?: string;
  /** Пояснение под вопросом в диалоге (последствия действия). Нейтральный цвет. */
  hint?: string;
  /** Иконка внутри: крестик (по умолчанию) или корзинка. */
  icon?: 'x' | 'trash';
  /** Размер кнопки: sm (h-8, по умолчанию) или md (h-10). */
  size?: 'sm' | 'md';
}

// Из подписи «Удерживайте, чтобы удалить замер» делаем вопрос и глагол для кнопки.
function parseLabel(label: string): { question: string; confirm: string } {
  const m = /^Удерживайте,\s*чтобы\s+(.+)$/i.exec(label);
  const action = (m?.[1] ?? label).trim();
  const question = `${action.charAt(0).toUpperCase()}${action.slice(1)}?`;
  const verb = action.split(' ')[0] ?? action;
  const confirm = `${verb.charAt(0).toUpperCase()}${verb.slice(1)}`;
  return { question, confirm };
}

/** Круглая кнопка удаления: тап открывает всплывающее подтверждение действия. */
export function HoldToDelete({
  onDelete,
  label = 'Удерживайте, чтобы убрать',
  hint,
  icon = 'x',
  size = 'sm',
}: HoldToDeleteProps) {
  const [open, setOpen] = useState(false);
  const { question, confirm } = parseLabel(label);

  return (
    <>
      <button
        type="button"
        aria-label={label}
        onClick={() => setOpen(true)}
        className={`flex shrink-0 items-center justify-center rounded-full bg-card-elevated text-ink-muted active:scale-95 ${
          size === 'md' ? 'h-10 w-10' : 'h-8 w-8'
        }`}
      >
        {icon === 'trash' ? <Trash2 size={16} /> : <X size={16} />}
      </button>
      {open && (
        <ConfirmDialog
          message={question}
          hint={hint}
          confirmLabel={confirm}
          danger
          onConfirm={() => {
            setOpen(false);
            onDelete();
          }}
          onCancel={() => setOpen(false)}
        />
      )}
    </>
  );
}
