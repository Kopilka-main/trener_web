import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

/** Тонкая строка «← На главную» вверху раздела (нижнего меню больше нет —
 * навигация хабом, как у тренера). */
export function BackBar() {
  return (
    <Link
      to="/"
      aria-label="На главную"
      className="flex items-center gap-1 pt-3 text-[13px] font-medium text-ink-muted active:text-ink"
    >
      <ChevronLeft size={18} />
      На главную
    </Link>
  );
}
