import { ScreenHeader } from '../components/ScreenHeader';

/** Заглушка для ещё не реализованных экранов. «Назад» ведёт на хаб-главную. */
export function StubPage({ title }: { title: string }) {
  return (
    <div className="flex min-h-full flex-col">
      <ScreenHeader title={title} back="/" />
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
