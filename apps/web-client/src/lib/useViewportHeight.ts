import { useEffect } from 'react';

/**
 * Держит CSS-переменную `--app-vh` равной высоте ВИДИМОЙ области (visualViewport).
 * На iOS при открытии клавиатуры видимая высота уменьшается: корень приложения
 * сжимается под клавиатуру, шапка остаётся закреплённой сверху, лента схлопывает
 * пустоту, а поле ввода стоит ровно над клавиатурой — без «уезжания» всей страницы.
 */
export function useViewportHeightVar(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    const apply = () => {
      const h = vv?.height ?? window.innerHeight;
      root.style.setProperty('--app-vh', `${Math.round(h)}px`);
    };
    apply();
    vv?.addEventListener('resize', apply);
    vv?.addEventListener('scroll', apply);
    window.addEventListener('orientationchange', apply);
    return () => {
      vv?.removeEventListener('resize', apply);
      vv?.removeEventListener('scroll', apply);
      window.removeEventListener('orientationchange', apply);
    };
  }, []);
}
