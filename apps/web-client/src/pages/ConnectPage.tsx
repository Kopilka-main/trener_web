import { useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useNavigate } from 'react-router-dom';
import { Check, Copy } from 'lucide-react';

export function ConnectPage({ code }: { code: string }) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  // Один тап по коду — копируем в буфер обмена, на 1.5с показываем «Скопировано».
  function copyCode() {
    void navigator.clipboard?.writeText(code).catch(() => undefined);
    setCopied(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-1 flex-col justify-center gap-6 px-2 py-8 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-[28px] leading-tight text-accent-text">
        Подключение
      </h1>
      <p className="text-sm text-ink-muted">
        Передай этот код тренеру — он подключит тебя, и появятся назначенные тренировки. Можно
        продолжить и заниматься самостоятельно.
      </p>
      <div className="mx-auto rounded-2xl bg-ink p-4">
        <QRCodeSVG value={code} size={180} bgColor="#eeeee8" fgColor="#0b0c10" />
      </div>
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={copyCode}
          aria-label="Скопировать код"
          className="flex items-center justify-center gap-2 rounded-xl border border-line bg-chip px-4 py-3 font-mono text-sm text-ink active:bg-card-elevated"
        >
          <span className="break-all">{code}</span>
          {copied ? (
            <Check size={16} strokeWidth={2.4} className="shrink-0 text-accent-text" />
          ) : (
            <Copy size={16} strokeWidth={1.9} className="shrink-0 text-ink-muted" />
          )}
        </button>
        <span className="text-[12px] text-ink-muted">
          {copied ? 'Скопировано' : 'Нажми, чтобы скопировать'}
        </span>
      </div>
      <button
        type="button"
        onClick={() => void navigate('/')}
        className="rounded-xl bg-accent py-3 font-semibold text-accent-on active:opacity-90"
      >
        Продолжить
      </button>
    </div>
  );
}
