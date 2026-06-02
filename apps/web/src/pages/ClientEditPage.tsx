import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useClient, useCreateClient, useUpdateClient } from '../api/clients';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { ScreenHeader } from '../components/ScreenHeader';

interface ClientEditPageProps {
  mode: 'create' | 'edit';
}

export function ClientEditPage({ mode }: ClientEditPageProps) {
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const id = params.id ?? '';

  const existing = useClient(mode === 'edit' ? id : '');
  const createMutation = useCreateClient();
  const updateMutation = useUpdateClient(id);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (mode === 'edit' && existing.data) {
      setFirstName(existing.data.firstName);
      setLastName(existing.data.lastName);
      setPhone(existing.data.phone ?? '');
      setNotes(existing.data.notes ?? '');
    }
  }, [mode, existing.data]);

  const mutation = mode === 'create' ? createMutation : updateMutation;

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const payload = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim() === '' ? null : phone.trim(),
      notes: notes.trim() === '' ? null : notes.trim(),
    };
    if (mode === 'create') {
      createMutation.mutate(payload, {
        onSuccess: (client) => {
          void navigate(`/clients/${client.id}`, { replace: true });
        },
      });
    } else {
      updateMutation.mutate(payload, {
        onSuccess: () => {
          void navigate(`/clients/${id}`, { replace: true });
        },
      });
    }
  }

  const title = mode === 'create' ? 'Новый клиент' : 'Редактирование';

  if (mode === 'edit' && existing.isPending) {
    return (
      <div className="flex flex-col">
        <ScreenHeader title={title} back={() => void navigate(-1)} />
        <p className="px-5 py-6 text-sm text-ink-muted">Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <ScreenHeader title={title} back={() => void navigate(-1)} />
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 pb-6 pt-2">
        <Field
          label="Имя"
          name="firstName"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          required
        />
        <Field
          label="Фамилия"
          name="lastName"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          required
        />
        <Field
          label="Телефон"
          name="phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <label htmlFor="notes" className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-muted">Заметки</span>
          <textarea
            id="notes"
            name="notes"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="rounded-xl border border-line bg-chip px-3 py-2.5 text-base text-ink outline-none placeholder:text-ink-mutedxl focus:border-accent"
          />
        </label>

        {mutation.isError && (
          <p className="text-sm text-ink-muted" role="alert">
            Не удалось сохранить. Проверьте поля и попробуйте снова.
          </p>
        )}

        <div className="flex flex-col gap-2">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Сохраняем…' : 'Сохранить'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => void navigate(-1)}>
            Отмена
          </Button>
        </div>
      </form>
    </div>
  );
}
