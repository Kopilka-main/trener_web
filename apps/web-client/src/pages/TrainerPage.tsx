import { useClientTrainer } from '../api/trainer';

function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

/** Полная карточка привязанного тренера: имя, специализация, «о себе», контакты.
 * Данные — публичный профиль тренера (без email/фото). Навигация назад — BackFab. */
export function TrainerPage() {
  const trainer = useClientTrainer();
  const t = trainer.data;

  return (
    <div className="flex h-full flex-col px-4 pb-8 pt-5">
      <h1 className="font-[family-name:var(--font-display)] text-[24px] text-ink">Тренер</h1>

      {trainer.isLoading && <p className="pt-6 text-sm text-ink-muted">Загрузка…</p>}
      {!trainer.isLoading && !t && (
        <p className="pt-6 text-sm text-ink-muted">Тренер не подключён.</p>
      )}

      {t && (
        <div className="mt-4 flex flex-col gap-5">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-chip font-[family-name:var(--font-display)] text-[22px] text-ink">
              {initials(t.firstName, t.lastName)}
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[20px] font-bold text-ink">
                {t.firstName} {t.lastName}
              </span>
              {t.title && <span className="text-[14px] text-ink-muted">{t.title}</span>}
            </div>
          </div>

          {t.bio && (
            <section className="flex flex-col gap-1.5">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-mutedxl">
                О тренере
              </h2>
              <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-ink">{t.bio}</p>
            </section>
          )}

          {t.contacts.length > 0 && (
            <section className="flex flex-col gap-1.5">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-mutedxl">
                Контакты
              </h2>
              <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl bg-card">
                {t.contacts.map((c, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-3 px-4 py-3 text-[14px]"
                  >
                    <span className="text-ink-muted">{c.type}</span>
                    <span className="min-w-0 truncate text-right text-ink">{c.value}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
