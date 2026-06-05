import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

const STORAGE_KEY = 'backfab.y';
const FAB = 47; // диаметр кнопки, px
const MARGIN = 16; // отступ от краёв по вертикали
const DRAG_THRESHOLD = 6; // сдвиг, после которого жест считается перетаскиванием

/** Допустимый диапазон вертикальной позиции с учётом высоты окна. */
function clampY(y: number): number {
  const max = window.innerHeight - FAB - MARGIN;
  const min = MARGIN;
  return Math.max(min, Math.min(max, y));
}

function initialY(): number {
  const raw = Number(localStorage.getItem(STORAGE_KEY));
  if (Number.isFinite(raw) && raw > 0) return clampY(raw);
  // По умолчанию — ближе к низу экрана.
  return clampY(window.innerHeight - FAB - 96);
}

/**
 * Родитель текущего экрана по ИЕРАРХИИ страниц (а не по истории браузера):
 * главная → разделы 1-го уровня → 2-го и т.д. По умолчанию — на сегмент вверх по URL.
 * Особые случаи, где промежуточный путь не является маршрутом:
 *  • всё под /knowledge/** ведёт на /knowledge (страниц /knowledge/exercises и т.п. нет).
 */
function parentPath(pathname: string): string {
  const segs = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  if (segs.length <= 1) return '/'; // раздел 1-го уровня или главная → главная
  if (segs[0] === 'knowledge') return '/knowledge';
  segs.pop();
  return '/' + segs.join('/');
}

/**
 * Плавающая круглая кнопка «назад»: видна на всех внутренних экранах,
 * прижата к правому краю каркаса и перетаскивается вдоль него по вертикали.
 * Короткий тап — на родительский экран по иерархии; позиция в localStorage.
 */
export function BackFab() {
  const navigate = useNavigate();
  const location = useLocation();
  const [y, setY] = useState<number>(() => initialY());
  const dragging = useRef(false);
  const moved = useRef(false);
  const startPointerY = useRef(0);
  const startY = useRef(0);

  // На главной возвращаться некуда — кнопку не показываем.
  if (location.pathname === '/') return null;

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    dragging.current = true;
    moved.current = false;
    startPointerY.current = e.clientY;
    startY.current = y;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!dragging.current) return;
    const dy = e.clientY - startPointerY.current;
    if (Math.abs(dy) > DRAG_THRESHOLD) moved.current = true;
    setY(clampY(startY.current + dy));
  }

  function onPointerUp() {
    if (!dragging.current) return;
    dragging.current = false;
    localStorage.setItem(STORAGE_KEY, String(y));
    if (moved.current) return;
    // Всегда поднимаемся по ИЕРАРХИИ страниц (родитель по уровню), не по истории.
    void navigate(parentPath(location.pathname));
  }

  return (
    <button
      type="button"
      aria-label="Назад"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (dragging.current = false)}
      style={{ top: y, width: FAB, height: FAB }}
      className="absolute right-3 z-40 flex touch-none select-none items-center justify-center rounded-full bg-card-elevated/55 text-ink opacity-65 shadow-[0_4px_14px_-2px_rgba(0,0,0,0.45)] backdrop-blur-sm transition-opacity active:bg-chip/70 active:opacity-100"
    >
      <ChevronLeft size={26} strokeWidth={2} />
    </button>
  );
}
