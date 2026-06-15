import { createPortal } from 'react-dom';

/** Всплывающее подтверждение действия: затемнение + карточка с вопросом и двумя кнопками.
 * Рендерим через портал в body, чтобы fixed-позиция считалась от вьюпорта, а не от
 * предка с transform (например, перетаскиваемой карточки dnd-kit). */
export function ConfirmDialog({
  message,
  hint,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  danger = false,
  onConfirm,
  onCancel,
}: {
  message: string;
  /** Пояснение под вопросом (последствия действия). Нейтральный цвет. */
  hint?: string | undefined;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <button
        type="button"
        aria-label="Отмена"
        onClick={onCancel}
        className="absolute inset-0 bg-black/60"
      />
      <div className="relative z-10 w-full max-w-[320px] rounded-2xl bg-card p-5 text-center shadow-[0_12px_40px_-8px_rgba(0,0,0,0.6)]">
        <p className="text-[15px] font-semibold leading-snug text-ink">{message}</p>
        {hint && <p className="mt-1.5 text-[13px] leading-snug text-ink-muted">{hint}</p>}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl bg-card-elevated py-3 text-[14px] font-semibold text-ink active:opacity-90"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 rounded-xl py-3 text-[14px] font-semibold active:opacity-90 ${
              danger ? 'bg-danger text-white' : 'bg-accent text-accent-on'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
