import { QRCodeSVG } from 'qrcode.react';
import { useClientLogout } from '../api/auth';

export function ConnectPage({ code }: { code: string }) {
  const logout = useClientLogout();
  return (
    <div className="mx-auto flex min-h-screen max-w-[430px] flex-col justify-center gap-6 bg-bg px-6 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-[28px] leading-tight text-accent">
        Подключение
      </h1>
      <p className="text-sm text-ink-muted">
        Передай этот код тренеру — он подключит тебя, и появятся твои тренировки.
      </p>
      <div className="mx-auto rounded-2xl bg-ink p-4">
        <QRCodeSVG value={code} size={180} bgColor="#eeeee8" fgColor="#0b0c10" />
      </div>
      <div className="rounded-xl border border-line bg-chip px-4 py-3 font-mono text-sm break-all text-ink">
        {code}
      </div>
      <button
        type="button"
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
        className="text-sm font-medium text-ink-muted disabled:opacity-60"
      >
        Выйти
      </button>
    </div>
  );
}
