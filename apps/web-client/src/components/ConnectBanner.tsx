import { Link } from 'react-router-dom';
import { Link2, ChevronRight } from 'lucide-react';

/** Тонкая полоса-приглашение подключить тренера. Видна, пока клиент не привязан. */
export function ConnectBanner() {
  return (
    <Link
      to="/connect"
      className="flex items-center justify-center gap-1.5 border-b border-line bg-card px-4 py-2 text-[13px] font-medium text-accent-text active:bg-card-elevated"
    >
      <Link2 size={15} />
      Подключить тренера
      <ChevronRight size={15} className="text-ink-mutedxl" />
    </Link>
  );
}
