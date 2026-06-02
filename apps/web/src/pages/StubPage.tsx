import { useNavigate, useParams } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { ScreenHeader } from '../components/ScreenHeader';
import { useLogout, useMe } from '../api/auth';

const CLIENT_SECTION_LABELS: Record<string, string> = {
  workouts: 'Тренировки',
  measurements: 'Замеры',
  photos: 'Фото прогресса',
  medcard: 'Медкарта',
  chat: 'Чат',
  payments: 'Оплаты',
  stats: 'Статистика',
};

/** Заглушка раздела карточки клиента (/clients/:id/:section). «Назад» — к карточке. */
export function ClientSectionPage() {
  const { id = '', section = '' } = useParams<{ id: string; section: string }>();
  const title = CLIENT_SECTION_LABELS[section] ?? 'Раздел';
  return <StubPage title={title} back={`/clients/${id}`} />;
}

/** Заглушка для ещё не реализованных экранов. «Назад» ведёт на хаб-главную. */
export function StubPage({ title, back = '/' }: { title: string; back?: string }) {
  return (
    <div className="flex min-h-full flex-col">
      <ScreenHeader title={title} back={back} />
      <div className="flex flex-col gap-2 px-5 pb-6 pt-2">
        <p className="text-sm text-ink-muted">Скоро</p>
      </div>
    </div>
  );
}

export function CalendarPage() {
  return <StubPage title="Календарь" />;
}

export function MessagesPage() {
  return <StubPage title="Сообщения" />;
}

export function AccountingPage() {
  return <StubPage title="Финансы" />;
}

export function NotificationsPage() {
  return <StubPage title="Уведомления" />;
}

/** Профиль тренера (заглушка): имя/контакты и кнопка выхода. */
export function ProfilePage() {
  const navigate = useNavigate();
  const me = useMe();
  const trainer = me.data?.trainer;
  const logoutMutation = useLogout();

  function handleLogout() {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        void navigate('/login');
      },
    });
  }

  return (
    <div className="flex min-h-full flex-col">
      <ScreenHeader title="Профиль" back="/" />
      <div className="flex flex-col gap-4 px-5 pb-6 pt-2">
        {trainer && (
          <div className="flex flex-col gap-1">
            <span className="text-[20px] font-bold leading-tight tracking-[-0.02em]">
              {trainer.firstName} {trainer.lastName}
            </span>
            {trainer.title && <span className="text-sm text-ink-muted">{trainer.title}</span>}
            <span className="text-sm text-ink-muted">{trainer.email}</span>
          </div>
        )}
        <button
          type="button"
          onClick={handleLogout}
          disabled={logoutMutation.isPending}
          className="flex items-center gap-2 self-start rounded-full bg-card px-4 py-2.5 text-sm font-semibold text-ink-muted active:bg-card-elevated disabled:opacity-50"
        >
          <LogOut size={18} strokeWidth={1.8} />
          Выйти
        </button>
      </div>
    </div>
  );
}
