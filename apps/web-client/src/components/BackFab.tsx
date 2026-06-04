import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { popBack } from '../lib/backStack';

const STORAGE_KEY = 'backfab.y';
const FAB = 36; // диаметр кнопки, px
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
 * Плавающая круглая кнопка «назад»: видна на всех внутренних экранах, прижата к
 * правому краю и перетаскивается по вертикали. Короткий тап — шаг назад по истории;
 * позиция запоминается в localStorage. Перенесена из тренерского приложения; в клиенте
 * прокручивается вся страница, поэтому позиционирование `fixed` (а не `absolute`).
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
    // Если открыт оверлей (лист выбора и т.п.) — кнопка закрывает его, а не уходит.
    if (popBack()) return;
    // React Router хранит индекс записи в history.state.idx. Если он 0 — это первый
    // экран сессии (страницу открыли по прямой ссылке), шагать назад некуда → на главную.
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) void navigate(-1);
    else void navigate('/');
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
      className="fixed right-3 z-[60] flex touch-none select-none items-center justify-center rounded-full bg-card-elevated/55 text-ink opacity-65 shadow-[0_4px_14px_-2px_rgba(0,0,0,0.45)] backdrop-blur-sm transition-opacity active:bg-chip/70 active:opacity-100"
    >
      <ChevronLeft size={20} strokeWidth={2} />
    </button>
  );
}
