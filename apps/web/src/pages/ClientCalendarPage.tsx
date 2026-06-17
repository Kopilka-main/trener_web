import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import type { SessionResponse } from '@trener/shared';
import { useClientSessions } from '../api/sessions';
import { useClient } from '../api/clients';
import { ScreenHeader } from '../components/ScreenHeader';
import { SessionsCalendar } from '../components/SessionsCalendar';
import { toISODate } from '../lib/calendar';
import { TrainerSessionSheet } from './CalendarPage';

/** Тап по пустому слоту: предзаполненные дата+время для новой сессии. */
type CreateAt = { date: string; startTime: string };

/**
 * Календарь конкретного клиента (тренер). Форма занятия — общая с тренерским
 * календарём (TrainerSessionSheet), но клиент зафиксирован на этом клиенте.
 */
export function ClientCalendarPage() {
  const { id = '' } = useParams<{ id: string }>();
  const sessions = useClientSessions(id);
  const client = useClient(id);

  const [anchor, setAnchor] = useState<Date>(new Date());
  // null — форма закрыта; 'new' — создание без слота; SessionResponse — редактирование;
  // CreateAt — создание с предзаполненным слотом.
  const [editing, setEditing] = useState<SessionResponse | 'new' | null>(null);
  const [createAt, setCreateAt] = useState<CreateAt | null>(null);

  const list = sessions.data ?? [];

  const title = client.data
    ? `Календарь · ${client.data.firstName} ${client.data.lastName}`
    : 'Календарь';
  // Метка занятия = имя клиента (для инициалов в недельном виде).
  const clientName = client.data
    ? `${client.data.firstName} ${client.data.lastName}`.trim()
    : 'Занятие';

  const openSlot = (date: Date, hour: number) => {
    setCreateAt({ date: toISODate(date), startTime: `${String(hour).padStart(2, '0')}:00` });
    setEditing(null);
  };
  const closeForm = () => {
    setEditing(null);
    setCreateAt(null);
  };
  const formOpen = editing !== null || createAt !== null;

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title={title} back={`/clients/${id}`} />

      {sessions.isError ? (
        <p className="px-2 pt-4 text-sm text-ink-muted" role="alert">
          Не удалось загрузить занятия. Попробуйте обновить страницу.
        </p>
      ) : (
        <SessionsCalendar
          sessions={list}
          defaultView="month"
          anchor={anchor}
          onAnchorChange={setAnchor}
          onSlotClick={openSlot}
          onSessionClick={setEditing}
          renderLabel={(s) => s.title ?? clientName}
          showStats
        />
      )}

      {/* FAB «+» снизу-справа — создать занятие */}
      <button
        type="button"
        onClick={() => {
          setEditing('new');
          setCreateAt(null);
        }}
        aria-label="Запланировать занятие"
        className="tile-shadow-primary fixed bottom-4 right-5 z-20 flex h-14 w-14 shrink-0 items-center justify-center rounded-full active:scale-[0.95]"
      >
        <Plus size={24} strokeWidth={2.2} />
      </button>

      {formOpen && (
        <TrainerSessionSheet
          clients={[]}
          fixedClient={{ id, name: clientName }}
          session={editing === 'new' || editing === null ? null : editing}
          defaultDate={createAt?.date ?? toISODate(anchor)}
          defaultStartTime={createAt?.startTime}
          onClose={closeForm}
        />
      )}
    </div>
  );
}
