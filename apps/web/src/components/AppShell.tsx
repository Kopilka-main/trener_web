import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';

/** Мобильный контейнер приложения: контент + нижняя навигация. */
export function AppShell() {
  return (
    <div className="mx-auto flex min-h-screen max-w-[430px] flex-col bg-white">
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
