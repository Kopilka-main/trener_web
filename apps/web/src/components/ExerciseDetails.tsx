import { useState } from 'react';
import type { ExerciseResponse } from '@trener/shared';
import { DemoVideo, MediaToggle, type MediaMode } from './DemoVideo';

/**
 * Read-only детали упражнения: демонстрация (зацикленное видео или картинка),
 * характеристики (оборудование, целевые мышцы, синергисты) и описание.
 * Данные есть у записей каталога; для своих упражнений тренера часть полей пуста.
 * Переиспользуется в форме упражнения и в карточках тренировки («Показать больше»).
 */
export function ExerciseDetails({
  exercise,
  showDescription = true,
}: {
  exercise: ExerciseResponse;
  showDescription?: boolean;
}) {
  const hasVideo = Boolean(exercise.videoUrl);
  const hasImage = Boolean(exercise.imageUrl);
  const hasMedia = hasVideo || hasImage;
  const hasChars = Boolean(
    exercise.equipment || exercise.primaryMuscles || exercise.secondaryMuscles,
  );
  const hasDescription = showDescription && Boolean(exercise.description);
  const [mode, setMode] = useState<MediaMode>(hasImage ? 'photo' : 'video');
  if (!hasMedia && !hasChars && !hasDescription) return null;

  return (
    <div className="flex flex-col gap-4">
      {hasMedia && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              Демонстрация
            </h3>
            {hasVideo && hasImage && <MediaToggle mode={mode} onChange={setMode} />}
          </div>
          {exercise.videoUrl ? (
            <DemoVideo
              src={exercise.videoUrl}
              poster={exercise.imageUrl ?? undefined}
              mode={mode}
              className="rounded-xl border border-line bg-card-elevated"
            />
          ) : (
            <img
              src={exercise.imageUrl ?? undefined}
              alt={exercise.name}
              className="w-full rounded-xl border border-line bg-card-elevated object-contain"
            />
          )}
        </section>
      )}

      {hasChars && (
        <section className="flex flex-col gap-2">
          <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            Характеристики
          </h3>
          <dl className="flex flex-col gap-2 rounded-xl border border-line bg-card px-4 py-3 text-[14px]">
            {exercise.equipment && (
              <div className="flex gap-3">
                <dt className="w-32 shrink-0 text-ink-muted">Оборудование</dt>
                <dd className="text-ink">{exercise.equipment}</dd>
              </div>
            )}
            {exercise.primaryMuscles && (
              <div className="flex gap-3">
                <dt className="w-32 shrink-0 text-ink-muted">Целевые мышцы</dt>
                <dd className="text-ink">{exercise.primaryMuscles}</dd>
              </div>
            )}
            {exercise.secondaryMuscles && (
              <div className="flex gap-3">
                <dt className="w-32 shrink-0 text-ink-muted">Дополнительно</dt>
                <dd className="text-ink">{exercise.secondaryMuscles}</dd>
              </div>
            )}
          </dl>
        </section>
      )}

      {hasDescription && (
        <section className="flex flex-col gap-2">
          <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            Описание
          </h3>
          <p className="whitespace-pre-line text-[14px] text-ink">{exercise.description}</p>
        </section>
      )}
    </div>
  );
}
