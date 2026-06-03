import { useParams } from 'react-router-dom';
import { ScreenHeader } from '../components/ScreenHeader';

const CLIENT_SECTION_LABELS: Record<string, string> = {
  workouts: 'Тренировки',
  measurements: 'Замеры',
  photos: 'Фото прогресса',
  medcard: 'Медкарта',
  chat: 'Чат',
  payments: 'Оплаты',
  calendar: 'Календарь',
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

export function MessagesPage() {
  return <StubPage title="Сообщения" />;
}
