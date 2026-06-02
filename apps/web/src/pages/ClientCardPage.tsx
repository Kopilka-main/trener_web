import { useNavigate, useParams } from 'react-router-dom';
import {
  Archive,
  ArchiveRestore,
  BarChart3,
  Camera,
  Dumbbell,
  FileText,
  MessageSquare,
  Pencil,
  Ruler,
  Trash2,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useClient, useDeleteClient, useUpdateClient } from '../api/clients';
import { ScreenHeader } from '../components/ScreenHeader';
import { Avatar } from '../components/Avatar';

const sections: Array<{ key: string; label: string; sub: string; Icon: LucideIcon }> = [
  { key: 'workouts', label: 'Тренировки', sub: 'текущая и история', Icon: Dumbbell },
  { key: 'measurements', label: 'Замеры', sub: 'динамика тела', Icon: Ruler },
  { key: 'photos', label: 'Фото', sub: 'прогресс', Icon: Camera },
  { key: 'medcard', label: 'Медкарта', sub: 'заметки врача', Icon: FileText },
  { key: 'chat', label: 'Чат', sub: 'переписка', Icon: MessageSquare },
  { key: 'payments', label: 'Оплаты', sub: 'пакеты и баланс', Icon: Wallet },
  { key: 'stats', label: 'Статистика', sub: 'прогресс', Icon: BarChart3 },
];

export function ClientCardPage() {
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const id = params.id ?? '';

  const client = useClient(id);
  const updateMutation = useUpdateClient(id);
  const deleteMutation = useDeleteClient();

  function handleArchive() {
    const next = client.data?.status === 'archived' ? 'active' : 'archived';
    updateMutation.mutate({ status: next });
  }

  function handleDelete() {
    if (!window.confirm('Удалить клиента? Действие необратимо.')) return;
    deleteMutation.mutate(id, {
      onSuccess: () => {
        void navigate('/clients', { replace: true });
      },
    });
  }

  if (client.isPending) {
    return (
      <div className="flex min-h-full flex-col">
        <ScreenHeader title="Клиент" back="/clients" />
        <p className="px-5 py-6 text-sm text-ink-muted">Загрузка…</p>
      </div>
    );
  }

  if (client.isError || !client.data) {
    return (
      <div className="flex min-h-full flex-col">
        <ScreenHeader title="Клиент" back="/clients" />
        <p className="px-5 py-6 text-sm text-ink-muted" role="alert">
          Не удалось загрузить клиента.
        </p>
      </div>
    );
  }

  const c = client.data;
  const isArchived = c.status === 'archived';

  return (
    <div className="flex min-h-full flex-col">
      <ScreenHeader
        title=""
        back="/clients"
        right={
          <button
            type="button"
            onClick={() => void navigate(`/clients/${id}/edit`)}
            aria-label="Редактировать"
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink active:bg-card-elevated"
          >
            <Pencil size={18} strokeWidth={1.8} />
          </button>
        }
      />

      <div className="flex flex-col gap-5 px-5 pb-8 pt-1">
        {/* Шапка: крупные инициалы + имя + телефон + чип статуса. */}
        <div className="flex items-center gap-4">
          <Avatar firstName={c.firstName} lastName={c.lastName} size={64} muted={isArchived} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h1 className="font-[family-name:var(--font-display)] text-[26px] leading-none tracking-[-0.02em] text-ink">
              {c.firstName} {c.lastName}
            </h1>
            <span className="truncate font-[family-name:var(--font-mono)] text-[13px] text-ink-muted">
              {c.phone ?? 'без телефона'}
            </span>
            <span className="mt-0.5 inline-flex w-fit items-center rounded-full bg-chip px-2.5 py-0.5 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.04em] text-ink-muted">
              {isArchived ? 'Архив' : 'Активный'}
            </span>
          </div>
        </div>

        {c.notes && (
          <section className="flex flex-col gap-1.5">
            <h2 className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.06em] text-ink-mutedxl">
              Заметки
            </h2>
            <p className="whitespace-pre-wrap rounded-2xl bg-card p-4 text-[14px] leading-relaxed text-ink">
              {c.notes}
            </p>
          </section>
        )}

        {/* Сетка разделов-плиток. */}
        <div className="grid grid-cols-2 gap-3">
          {sections.map(({ key, label, sub, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => void navigate(`/clients/${id}/${key}`)}
              className="tile-shadow flex flex-col items-start gap-3 rounded-2xl p-4 text-left active:scale-[0.98]"
            >
              <Icon size={22} strokeWidth={1.8} className="text-accent" />
              <span className="flex flex-col">
                <span className="text-[14px] font-bold leading-tight text-ink">{label}</span>
                <span className="text-[11px] text-ink-muted">{sub}</span>
              </span>
            </button>
          ))}
        </div>

        {/* Действия. */}
        <div className="flex flex-col gap-2 pt-1">
          <button
            type="button"
            onClick={handleArchive}
            disabled={updateMutation.isPending}
            className="flex items-center justify-center gap-2 rounded-2xl bg-card-elevated py-3.5 text-[14px] font-semibold text-ink active:bg-card disabled:opacity-50"
          >
            {isArchived ? (
              <>
                <ArchiveRestore size={18} strokeWidth={1.8} /> Вернуть из архива
              </>
            ) : (
              <>
                <Archive size={18} strokeWidth={1.8} /> В архив
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="flex items-center justify-center gap-2 rounded-2xl bg-card py-3.5 text-[14px] font-semibold text-ink active:bg-card-elevated disabled:opacity-50"
          >
            <Trash2 size={18} strokeWidth={1.8} className="text-danger" /> Удалить
          </button>
        </div>
      </div>
    </div>
  );
}
