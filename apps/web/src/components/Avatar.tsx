interface AvatarProps {
  firstName: string;
  lastName: string;
  /** Диаметр круга в пикселях. */
  size?: number;
  /** Приглушённый вид (архивный клиент). */
  muted?: boolean;
  /** URL фото-аватара. Если задан — рендерим <img>, иначе инициалы. */
  src?: string | null;
}

/** Круг с фото клиента либо (если фото нет) с инициалами: обычный текст на тёмной плашке. */
export function Avatar({ firstName, lastName, size = 44, muted = false, src = null }: AvatarProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={`${firstName} ${lastName}`.trim()}
        width={size}
        height={size}
        className="shrink-0 rounded-full bg-card-elevated object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase() || '?';
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full bg-card-elevated font-semibold leading-none"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        color: muted ? 'var(--color-ink-muted)' : 'var(--color-ink)',
      }}
    >
      {initials}
    </span>
  );
}
