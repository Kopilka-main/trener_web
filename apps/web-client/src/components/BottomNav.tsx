import { NavLink } from 'react-router-dom';
import { Dumbbell, Calendar, MessageCircle, TrendingUp, User } from 'lucide-react';
import { useClientChatUnread } from '../api/chat';

const ITEMS = [
  { to: '/', label: 'Тренировки', Icon: Dumbbell, end: true },
  { to: '/calendar', label: 'Календарь', Icon: Calendar, end: false },
  { to: '/chat', label: 'Чат', Icon: MessageCircle, end: false },
  { to: '/progress', label: 'Прогресс', Icon: TrendingUp, end: false },
  { to: '/profile', label: 'Профиль', Icon: User, end: false },
];

export function BottomNav() {
  const unread = useClientChatUnread();
  const chatUnread = unread.data ?? 0;
  return (
    <nav className="sticky bottom-0 z-10 flex border-t border-line bg-bg/95 backdrop-blur">
      {ITEMS.map(({ to, label, Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] ${
              isActive ? 'text-accent' : 'text-ink-muted'
            }`
          }
        >
          <span className="relative">
            <Icon size={22} />
            {to === '/chat' && chatUnread > 0 && (
              <span className="absolute -right-2 -top-1 min-w-[16px] rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-4 text-white">
                {chatUnread > 9 ? '9+' : chatUnread}
              </span>
            )}
          </span>
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
