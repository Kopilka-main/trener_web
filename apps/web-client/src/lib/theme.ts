// Переключение светлой/тёмной темы. Тёмная включается атрибутом
// <html data-theme="dark"> (переопределяет токены в packages/theme/theme.css).
// Выбор хранится в localStorage; ранняя установка — инлайн-скриптом в index.html.

export type Theme = 'light' | 'dark';

const KEY = 'theme';

export function getTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(theme: Theme): void {
  if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0b0c10' : '#f5f5f4');
}

export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // localStorage недоступен — просто применяем на сессию
  }
  applyTheme(theme);
}
