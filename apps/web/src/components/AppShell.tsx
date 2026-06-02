import { Outlet } from 'react-router-dom';

/**
 * Мобильный каркас приложения: контент со скроллом без глобальной нижней
 * навигации. У тренера навигация идёт через плитки на главной (HomePage) и
 * кнопку «назад» в ScreenHeader внутренних экранов.
 */
export function AppShell() {
  return (
    <div className="app-shell">
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
