interface AvatarProps {
  firstName: string;
  lastName: string;
  /** Диаметр круга в пикселях. */
  size?: number;
  /** Приглушённый вид (архивный клиент). */
  muted?: boolean;
}

/** Круг с инициалами клиента: лайм-текст на тёмной плашке. */
export function Avatar({ firstName, lastName, size = 44, muted = false }: AvatarProps) {
  const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase() || '?';
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full bg-card-elevated font-[family-name:var(--font-display)] leading-none tracking-[-0.02em]"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.34),
        color: muted ? 'var(--color-ink-muted)' : 'var(--color-accent)',
      }}
    >
      {initials}
    </span>
  );
}
