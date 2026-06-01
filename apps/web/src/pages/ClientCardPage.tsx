import { Link, useNavigate, useParams } from 'react-router-dom';
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
    return <p className="px-5 py-6 text-sm text-slate-500">Загрузка…</p>;
  }

  if (client.isError || !client.data) {
    return (
      <p className="px-5 py-6 text-sm text-slate-500" role="alert">
        Не удалось загрузить клиента.
      </p>
    );
  }

  const c = client.data;
  const isArchived = c.status === 'archived';

  return (
    <div className="flex flex-col gap-6 px-5 py-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-slate-900">
          {c.firstName} {c.lastName}
        </h1>
        <span className="text-sm text-slate-500">{isArchived ? 'Архив' : 'Активный'}</span>
      </div>

      <dl className="flex flex-col gap-3">
        {c.phone && (
          <div className="flex flex-col">
            <dt className="text-sm text-slate-500">Телефон</dt>
            <dd className="text-base text-slate-900">{c.phone}</dd>
          </div>
        )}
        {c.notes && (
          <div className="flex flex-col">
            <dt className="text-sm text-slate-500">Заметки</dt>
            <dd className="whitespace-pre-wrap text-base text-slate-900">{c.notes}</dd>
          </div>
        )}
      </dl>

      <ul className="flex flex-col gap-2">
        {sections.map((s) => (
          <li key={s.key}>
            <Link
              to="/more"
              className="flex items-center justify-between rounded-2xl bg-slate-100 px-4 py-3 text-base font-medium text-slate-900"
            >
              {s.label}
              <span className="text-slate-400">›</span>
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
