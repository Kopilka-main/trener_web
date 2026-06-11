import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { BackFab } from './BackFab';
import { AppBadgeSync } from './AppBadgeSync';
import { PushSync } from './PushSync';

/**
 * Привязывает высоту каркаса к visual viewport: при открытии экранной клавиатуры
 * (особенно iOS Safari) layout-вьюпорт НЕ уменьшается. Подгоняя высоту каркаса под
 * видимую область, держим шапку сверху, а поле ввода — прямо над клавиатурой.
 * Документ зафиксирован (см. body в index.css), поэтому смещать каркас не нужно.
 */
function useVisualViewportHeight(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const root = document.documentElement;
    const apply = () => root.style.setProperty('--app-height', `${String(vv.height)}px`);
    apply();
    vv.addEventListener('resize', apply);
    return () => {
      vv.removeEventListener('resize', apply);
      root.style.removeProperty('--app-height');
    };
  }, []);
}

/**
 * Мобильный каркас приложения: контент со скроллом без глобальной нижней
 * навигации. Навигация назад — плавающей кнопкой BackFab (на всех экранах,
 * кроме главной), вперёд — через плитки на главной (HomePage).
 */
export function AppShell() {
  useVisualViewportHeight();

  return (
    <div className="app-shell">
      <AppBadgeSync />
      <PushSync />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <BackFab />
    </div>
  );
}
