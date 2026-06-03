import { Outlet } from 'react-router-dom';
import { BackFab } from './BackFab';

/**
 * Мобильный каркас приложения: контент со скроллом без глобальной нижней
 * навигации. Навигация назад — плавающей кнопкой BackFab (на всех экранах,
 * кроме главной), вперёд — через плитки на главной (HomePage).
 */
export function AppShell() {
  return (
    <div className="app-shell">
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <BackFab />
    </div>
  );
}
