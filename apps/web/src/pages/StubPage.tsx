/** Заглушка для ещё не реализованных экранов. */
export function StubPage({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-2 px-5 pb-6 pt-4">
      <h1 className="font-[family-name:var(--font-display)] text-[34px] leading-none tracking-[-0.02em]">
        {title}
      </h1>
      <p className="text-sm text-ink-muted">Скоро</p>
    </div>
  );
}

export function CalendarPage() {
  return <StubPage title="Календарь" />;
}
