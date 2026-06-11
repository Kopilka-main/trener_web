import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { BackFab } from './BackFab';
import { AppBadgeSync } from './AppBadgeSync';
import { PushSync } from './PushSync';

/**
 * Привязывает высоту каркаса к visual viewport: при открытии экранной клавиатуры
 * (особенно iOS Safari) layout-вьюпорт НЕ уменьшается, и браузер прокручивает
 * страницу, чтобы показать поле ввода, — из-за чего шапка уезжает за экран.
 * Подгоняя высоту под видимую область, держим шапку сверху, а ввод — над клавиатурой.
 */
function useVisualViewportHeight(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const root = document.documentElement;
    const apply = () => {
      // Высота видимой области + её смещение от верха layout-вьюпорта (iOS при
      // клавиатуре сдвигает visual viewport — каркас прижимаем к видимой области).
      root.style.setProperty('--app-height', `${String(vv.height)}px`);
      root.style.setProperty('--app-offset', `${String(vv.offsetTop)}px`);
    };
    apply();
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
      root.style.removeProperty('--app-height');
      root.style.removeProperty('--app-offset');
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
