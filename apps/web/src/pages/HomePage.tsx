import { Link } from 'react-router-dom';
import { ArrowUpRight, BookOpen, CalendarDays, MessageSquare, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useMe } from '../api/auth';

const tiles: { to: string; label: string; sub: string; Icon: LucideIcon; primary?: boolean }[] = [
  { to: '/clients', label: 'Клиенты', sub: 'контакты и пакеты', Icon: Users, primary: true },
  { to: '/calendar', label: 'Календарь', sub: 'расписание занятий', Icon: CalendarDays },
  { to: '/more', label: 'Сообщения', sub: 'клиенты и заметки', Icon: MessageSquare },
  { to: '/knowledge', label: 'База знаний', sub: 'упражнения и шаблоны', Icon: BookOpen },
];

export function HomePage() {
  const me = useMe();
  const name = me.data?.trainer.firstName ?? '';

  return (
    <div className="flex flex-col gap-6 px-5 pb-6 pt-4">
      <h1 className="font-[family-name:var(--font-display)] text-[40px] leading-none tracking-[-0.02em] text-accent">
        {name ? `Привет, ${name}` : 'Главная'}
      </h1>

      <div className="grid grid-cols-2 gap-3">
        {tiles.map((tile) => (
          <Link
            key={tile.to}
            to={tile.to}
            className={`relative flex aspect-square flex-col rounded-2xl px-4 pb-4 pt-3.5 active:scale-[0.97] ${
              tile.primary ? 'tile-shadow-primary' : 'tile-shadow'
            }`}
          >
            <span
              className={`-ml-1 flex h-10 w-10 items-center justify-center rounded-lg ${
                tile.primary ? 'tile-icon-shell-primary' : 'tile-icon-shell'
              }`}
            >
              <tile.Icon size={22} strokeWidth={1.8} />
            </span>
            <ArrowUpRight
              size={16}
              strokeWidth={1.8}
              className={`absolute right-4 top-4 ${tile.primary ? 'tile-arrow-primary' : 'tile-arrow'}`}
            />
            <span className="flex-1" />
            <span className="text-[17px] font-bold leading-tight tracking-[-0.02em]">
              {tile.label}
            </span>
            <span
              className="mt-1 truncate text-[11px] font-semibold tracking-[0.01em]"
              style={{
                color: tile.primary ? 'rgba(11,12,16,0.55)' : 'var(--color-ink-mutedxl)',
              }}
            >
              {tile.sub}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
