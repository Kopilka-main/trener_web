import { NavLink } from 'react-router-dom';

const items = [
  { to: '/clients', label: 'Клиенты' },
  { to: '/knowledge', label: 'База' },
  { to: '/calendar', label: 'Календарь' },
  { to: '/more', label: 'Ещё' },
] as const;

export function BottomNav() {
  return (
    <nav className="sticky bottom-0 border-t border-slate-200 bg-white">
      <ul className="flex">
        {items.map((item) => (
          <li key={item.to} className="flex-1">
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2.5 text-xs font-medium ${
                  isActive ? 'text-slate-900' : 'text-slate-500'
                }`
              }
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
