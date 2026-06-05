import { useState } from 'react';
import { useClientTrainer, useDisconnectTrainer } from '../api/trainer';

function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

/** Кружок тренера: фото (если есть и грузится), иначе инициалы. */
function TrainerAvatar({
  firstName,
  lastName,
  avatarFileId,
}: {
  firstName: string;
  lastName: string;
  avatarFileId: string | null;
}) {
  const [failed, setFailed] = useState(false);
  if (avatarFileId && !failed) {
    return (
      <img
        src={`/api/client/trainer/avatar?v=${avatarFileId}`}
        alt={`${firstName} ${lastName}`.trim()}
        onError={() => setFailed(true)}
        className="h-16 w-16 shrink-0 rounded-full bg-chip object-cover"
      />
    );
  }
  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-chip font-[family-name:var(--font-display)] text-[22px] text-ink">
      {initials(firstName, lastName)}
    </div>
  );
}

/** Полная карточка привязанного тренера: имя, специализация, «о себе», контакты.
 * Данные — публичный профиль тренера (без email/фото). Навигация назад — BackFab. */
export function TrainerPage() {
  const trainer = useClientTrainer();
  const t = trainer.data;

  return (
    <div className="flex h-full flex-col px-2 pb-8 pt-5">
      <h1 className="font-[family-name:var(--font-display)] text-[24px] text-ink">Тренер</h1>

      {trainer.isLoading && <p className="pt-6 text-sm text-ink-muted">Загрузка…</p>}
      {!trainer.isLoading && !t && (
        <p className="pt-6 text-sm text-ink-muted">Тренер не подключён.</p>
      )}

      {t && (
        <div className="mt-4 flex flex-col gap-5">
          <div className="flex items-center gap-4">
            <TrainerAvatar
              firstName={t.firstName}
              lastName={t.lastName}
              avatarFileId={t.avatarFileId}
            />
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

          <DisconnectSection trainerName={`${t.firstName} ${t.lastName}`.trim()} />
        </div>
      )}
    </div>
  );
}

/** Отключение от тренера: раскрывается в подтверждение вводом имени тренера.
 * Данные клиента при этом сохраняются — рвётся только привязка к тренеру. */
function DisconnectSection({ trainerName }: { trainerName: string }) {
  const disconnect = useDisconnectTrainer();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  const matches = name.trim().toLowerCase() === trainerName.toLowerCase();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 rounded-xl bg-card py-3 text-[14px] font-semibold text-ink active:bg-card-elevated"
      >
        Отключиться от тренера
      </button>
    );
  }

  return (
    <section className="mt-2 flex flex-col gap-3 rounded-2xl bg-card p-4">
      <p className="text-[13px] leading-relaxed text-ink-muted">
        Связь с тренером будет разорвана. Ваши тренировки, замеры и история сохранятся. Чтобы
        подтвердить, введите имя тренера:{' '}
        <span className="font-semibold text-ink">{trainerName}</span>
      </p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Имя тренера"
        autoFocus
        className="rounded-xl border border-line bg-chip px-3 py-2.5 text-base text-ink outline-none placeholder:text-ink-mutedxl focus:border-accent"
      />
      {disconnect.isError && (
        <p className="text-[13px] text-ink-muted" role="alert">
          Не удалось отключиться. Попробуйте снова.
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setName('');
          }}
          disabled={disconnect.isPending}
          className="flex-1 rounded-xl bg-card-elevated py-3 text-[14px] font-semibold text-ink active:opacity-90 disabled:opacity-60"
        >
          Отмена
        </button>
        <button
          type="button"
          onClick={() => disconnect.mutate()}
          disabled={!matches || disconnect.isPending}
          className="flex-1 rounded-xl bg-danger py-3 text-[14px] font-semibold text-white active:opacity-90 disabled:opacity-40"
        >
          {disconnect.isPending ? 'Отключение…' : 'Отключиться'}
        </button>
      </div>
    </section>
  );
}
