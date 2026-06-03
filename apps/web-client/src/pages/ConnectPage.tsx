import { QRCodeSVG } from 'qrcode.react';
import { useNavigate } from 'react-router-dom';
import { useClientLogout } from '../api/auth';

export function ConnectPage({ code }: { code: string }) {
  const logout = useClientLogout();
  const navigate = useNavigate();
  return (
    <div className="flex flex-1 flex-col justify-center gap-6 px-6 py-8 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-[28px] leading-tight text-accent">
        Подключение
      </h1>
      <p className="text-sm text-ink-muted">
        Передай этот код тренеру — он подключит тебя, и появятся назначенные тренировки. Можно
        продолжить и заниматься самостоятельно.
      </p>
      <div className="mx-auto rounded-2xl bg-ink p-4">
        <QRCodeSVG value={code} size={180} bgColor="#eeeee8" fgColor="#0b0c10" />
      </div>
      <div className="rounded-xl border border-line bg-chip px-4 py-3 font-mono text-sm break-all text-ink">
        {code}
      </div>
      <button
        type="button"
        onClick={() => void navigate('/')}
        className="rounded-xl bg-accent py-3 font-semibold text-accent-on active:opacity-90"
      >
        Продолжить
      </button>
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
