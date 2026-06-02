import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useClient, useDeleteClient, useUpdateClient } from '../api/clients';
import { Button } from '../components/Button';

const sections = [
  { key: 'workouts', label: 'Тренировки' },
  { key: 'measurements', label: 'Замеры' },
  { key: 'photos', label: 'Фото прогресса' },
  { key: 'medcard', label: 'Медкарта' },
  { key: 'chat', label: 'Чат' },
] as const;

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
    return <p className="px-5 py-6 text-sm text-ink-muted">Загрузка…</p>;
  }

  if (client.isError || !client.data) {
    return (
      <p className="px-5 py-6 text-sm text-ink-muted" role="alert">
        Не удалось загрузить клиента.
      </p>
    );
  }

  const c = client.data;
  const isArchived = c.status === 'archived';

  return (
    <div className="flex flex-col gap-6 px-5 pb-6 pt-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] text-[30px] leading-none tracking-[-0.02em]">
          {c.firstName} {c.lastName}
        </h1>
        <span className="text-sm text-ink-muted">{isArchived ? 'Архив' : 'Активный'}</span>
      </div>

      <dl className="flex flex-col gap-3">
        {c.phone && (
          <div className="flex flex-col">
            <dt className="text-sm text-ink-muted">Телефон</dt>
            <dd className="text-base text-ink">{c.phone}</dd>
          </div>
        )}
        {c.notes && (
          <div className="flex flex-col">
            <dt className="text-sm text-ink-muted">Заметки</dt>
            <dd className="whitespace-pre-wrap text-base text-ink">{c.notes}</dd>
          </div>
        )}
      </dl>

      <ul className="flex flex-col gap-2">
        {sections.map((s) => (
          <li key={s.key}>
            <Link
              to="/more"
              className="row-glow flex items-center justify-between rounded-2xl bg-card px-4 py-3 text-base font-semibold text-ink transition-colors active:bg-card-elevated"
            >
              {s.label}
              <ChevronRight size={16} className="tile-chevron" />
            </Link>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2">
        <Button onClick={() => void navigate(`/clients/${id}/edit`)}>Редактировать</Button>
        <Button variant="secondary" onClick={handleArchive} disabled={updateMutation.isPending}>
          {isArchived ? 'Вернуть из архива' : 'В архив'}
        </Button>
        <Button variant="secondary" onClick={handleDelete} disabled={deleteMutation.isPending}>
          Удалить
        </Button>
      </div>
    </div>
  );
}
