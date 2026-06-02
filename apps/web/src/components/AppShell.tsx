import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';

/** Мобильный каркас приложения: контент со скроллом + нижняя навигация. */
export function AppShell() {
  return (
    <div className="app-shell">
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
