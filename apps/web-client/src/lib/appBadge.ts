type BadgeNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/**
 * Ставит/снимает счётчик на иконке установленного приложения (App Badging API).
 * Работает в установленном PWA: Android Chrome, десктоп Chrome/Edge, iOS 16.4+.
 * Где не поддерживается — тихо ничего не делает.
 */
export function updateAppBadge(count: number): void {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as BadgeNavigator;
  if (!nav.setAppBadge) return;
  try {
    if (count > 0) void nav.setAppBadge(count);
    else if (nav.clearAppBadge) void nav.clearAppBadge();
  } catch {
    // нет поддержки/прав — игнорируем
  }
}
