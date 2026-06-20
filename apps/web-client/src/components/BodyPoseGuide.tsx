import type { Angle } from '@trener/shared';

const POSES: { value: Angle; label: string }[] = [
  { value: 'front', label: 'Спереди' },
  { value: 'side', label: 'Сбоку' },
  { value: 'back', label: 'Сзади' },
];

// Силуэт-«тушка» для подсказки как встать. Заливка currentColor — цвет задаёт родитель.
function Silhouette({ pose }: { pose: Angle }) {
  return (
    <svg
      viewBox="0 0 80 170"
      className="h-20 w-auto"
      fill="currentColor"
      aria-hidden="true"
      role="presentation"
    >
      {pose === 'side' ? (
        <>
          {/* профиль: голова смещена влево, тело одной колонкой, ноги в шаге */}
          <circle cx="33" cy="16" r="11" />
          <path d="M30 9 q-6 5 -1 11 q-5 1 -5 -4 q0 -7 6 -7 Z" />
          <rect x="30" y="30" width="17" height="56" rx="8.5" />
          <rect x="35" y="34" width="7" height="46" rx="3.5" transform="rotate(7 38 34)" />
          <rect x="32" y="84" width="9" height="66" rx="4.5" transform="rotate(2 36 84)" />
          <rect x="39" y="84" width="9" height="66" rx="4.5" transform="rotate(-3 43 84)" />
        </>
      ) : (
        <>
          {/* фронт/спина: симметричный силуэт, руки чуть отведены, ноги на ширине */}
          <circle cx="40" cy="15" r="11" />
          <path d="M23 34 Q23 29 28 29 H52 Q57 29 57 34 L52 72 L55 84 Q55 89 50 89 H30 Q25 89 25 84 L28 72 Z" />
          <rect x="15" y="32" width="8" height="46" rx="4" transform="rotate(9 19 34)" />
          <rect x="57" y="32" width="8" height="46" rx="4" transform="rotate(-9 61 34)" />
          <rect x="30" y="83" width="9" height="66" rx="4.5" />
          <rect x="41" y="83" width="9" height="66" rx="4.5" />
        </>
      )}
    </svg>
  );
}

/**
 * Подсказка-шаблон «как фотографироваться»: три силуэта (спереди/сбоку/сзади).
 * Двойного назначения — выбранный ракурс подсвечен, тап по силуэту его выбирает.
 */
export function BodyPoseGuide({
  value,
  onSelect,
}: {
  value: Angle;
  onSelect?: (a: Angle) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="px-0.5 text-[12px] leading-snug text-ink-muted">
        В облегающей одежде или белье, телефон на уровне пояса, ровный фон, вся фигура в кадре.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {POSES.map((p) => {
          const active = p.value === value;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => onSelect?.(p.value)}
              aria-pressed={active}
              className={`flex flex-col items-center gap-1 rounded-xl border py-2.5 transition-colors ${
                active
                  ? 'border-accent bg-accent/10 text-accent-text'
                  : 'border-line bg-card-elevated text-ink-mutedxl'
              }`}
            >
              <Silhouette pose={p.value} />
              <span
                className={`text-[12px] font-semibold ${active ? 'text-ink' : 'text-ink-muted'}`}
              >
                {p.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
