/** Заглушка для ещё не реализованных экранов. */
export function StubPage({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-2 px-5 py-6">
      <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
      <p className="text-sm text-slate-500">Скоро</p>
    </div>
  );
}

export function CalendarPage() {
  return <StubPage title="Календарь" />;
}
