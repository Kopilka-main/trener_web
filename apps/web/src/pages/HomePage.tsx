import { Link } from 'react-router-dom';
import { useMe } from '../api/auth';

const tiles = [
  { to: '/clients', label: 'Клиенты' },
  { to: '/knowledge', label: 'База знаний' },
  { to: '/calendar', label: 'Календарь' },
  { to: '/more', label: 'Ещё' },
] as const;

export function HomePage() {
  const me = useMe();
  const name = me.data?.trainer.firstName ?? '';

  return (
    <div className="flex flex-col gap-6 px-5 py-6">
      <h1 className="text-2xl font-semibold text-slate-900">
        {name ? `Привет, ${name}` : 'Главная'}
      </h1>
      <div className="grid grid-cols-2 gap-3">
        {tiles.map((tile) => (
          <Link
            key={tile.to}
            to={tile.to}
            className="flex aspect-square flex-col justify-end rounded-2xl bg-slate-100 p-4 text-base font-medium text-slate-900"
          >
            {tile.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
