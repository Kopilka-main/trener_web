import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { BackFab } from './BackFab';
import { AppBadgeSync } from './AppBadgeSync';
import { PushSync } from './PushSync';
import { PushPrompt } from './PushPrompt';

/**
 * Привязывает каркас к visual viewport: при открытии клавиатуры (особенно iOS
 * Safari) layout-вьюпорт НЕ уменьшается, а visual viewport сжимается и сдвигается.
 * Подгоняем высоту (`--app-height`) и верх (`--app-offset`) под видимую область —
 * шапка остаётся сверху, поле ввода над клавиатурой. Документ зафиксирован
 * (body в index.css: overscroll:none), поэтому offset меняется только от клавиатуры,
 * а не от «оттяжки» пальцем — каркас не дёргается при перетаскивании.
 */
function useVisualViewportHeight(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const root = document.documentElement;
    const apply = () => {
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
      <PushPrompt />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <BackFab />
    </div>
  );
}
