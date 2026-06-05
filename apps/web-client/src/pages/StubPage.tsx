export function StubPage({ title }: { title: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-2 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-[28px] text-accent-text">
        {title}
      </h1>
      <p className="text-sm text-ink-muted">Скоро</p>
    </div>
  );
}
