import { NavLink } from 'react-router-dom';
import { BookOpen, CalendarDays, MoreHorizontal, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const items: { to: string; label: string; Icon: LucideIcon }[] = [
  { to: '/clients', label: 'Клиенты', Icon: Users },
  { to: '/knowledge', label: 'База', Icon: BookOpen },
  { to: '/calendar', label: 'Календарь', Icon: CalendarDays },
  { to: '/more', label: 'Ещё', Icon: MoreHorizontal },
];

export function BottomNav() {
  return (
    <nav className="shrink-0 border-t border-line bg-card-elevated pb-[max(0.25rem,env(safe-area-inset-bottom))]">
      <ul className="grid grid-cols-4">
        {items.map(({ to, label, Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                  isActive ? 'text-accent' : 'text-ink-muted'
                }`
              }
            >
              <Icon size={20} strokeWidth={1.8} />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
