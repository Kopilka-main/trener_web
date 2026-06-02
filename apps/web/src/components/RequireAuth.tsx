import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useMe } from '../api/auth';

/**
 * Auth-гейт. Пока грузится /me — спиннер; при ошибке (в т.ч. 401) — редирект
 * на /login; при успехе — рендерит защищённое содержимое.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const me = useMe();

  if (me.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg text-ink-muted">
        <span>Загрузка…</span>
      </div>
    );
  }

  if (me.isError) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
