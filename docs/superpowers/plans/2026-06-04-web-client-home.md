# Главная клиентского приложения — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Хаб-главная клиента (`/`) по образцу тренерской `HomePage`: дата+шестерёнка, герой-число сессий сегодня + строка «следующей», сетка плиток 2×3 с метриками и одной primary; список тренировок переезжает на `/workouts`, в нижнем меню появляется «Главная».

**Architecture:** Фронт-онли (новый бэкенд не нужен). Порт визуальных примитивов (`Tile`/`MetricLabel`/date-хелперы + CSS-классы `tile-*`) из тренерского приложения в `apps/web-client`; данные — существующие клиентские хуки.

**Tech Stack:** React 18 + Vite + Tailwind v4 + TanStack Query 5.

**Спека:** `docs/superpowers/specs/2026-06-04-web-client-home-design.md`.

---

## Соглашения

- Бэкенда нет → docker/БД/миграции не трогаем; сабагент гоняет `npm run typecheck` (корневой) и `npm run test -w apps/web-client`.
- Окружение — PowerShell; для git/npm — Bash tool.
- Conventional Commits, без `--no-verify`. ⚠️ commitlint: subject не должен начинаться с аббревиатуры в верхнем регистре.
- Правило цвета: красный только для иконок severity / кнопок реального действия; в тексте-статусах — нейтральные ink-токены.

---

## File Structure

- **Изменяю:** `apps/web-client/src/index.css` (добавить CSS-утилиты `tile-*`).
- **Создаю:** `apps/web-client/src/pages/HomePage.tsx` (экран-хаб).
- **Создаю:** `apps/web-client/src/pages/HomePage.test.tsx` (unit-тест).
- **Изменяю:** `apps/web-client/src/App.tsx` (`/` → HomePage, `/workouts` → WorkoutsListPage).
- **Изменяю:** `apps/web-client/src/components/BottomNav.tsx` (1-я вкладка «Главная»).
- **Изменяю:** `apps/web-client/src/pages/WorkoutDetailPage.tsx` (ссылки «назад» `/` → `/workouts`).

Тренерский код не трогаем.

---

## Task 1: CSS-утилиты плиток в web-client

**Files:**

- Modify: `apps/web-client/src/index.css`

Контекст: классы `tile-shadow`, `tile-shadow-primary`, `tile-icon-shell(-primary)`, `tile-arrow(-primary)`, `tile-chevron`, `shelf` определены только в `apps/web/src/index.css`; web-client импортирует лишь `theme.css` (цвета). Без них плитки хаба не получат вид (acid-fill primary, glow). Переносим блок в web-client (изолированно, тренерский CSS не трогаем). Это заодно чинит уже использующийся `tile-shadow` в `StatsPage`.

- [ ] **Step 1: Дописать блок `tile-*` в конец `apps/web-client/src/index.css`**

Добавить В КОНЕЦ файла (после существующего содержимого) дословный блок:

```css
/* Плитки на главном экране — material-like elevation и лайм-glow при нажатии.
   Перенесено из apps/web (приложения не импортируют друг друга). */
.tile-shadow {
  background: var(--color-card);
  color: var(--color-ink);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    inset 0 -1px 0 rgba(0, 0, 0, 0.35),
    0 0 0 1px var(--color-line),
    0 1px 2px rgba(0, 0, 0, 0.3),
    0 6px 14px -4px rgba(0, 0, 0, 0.45);
  transition:
    box-shadow 180ms ease,
    transform 120ms ease;
}

.tile-shadow-primary {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--color-accent) 94%, white 6%),
    var(--color-accent)
  );
  color: var(--color-accent-on);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.18),
    inset 0 -1px 0 rgba(0, 0, 0, 0.18),
    0 2px 4px rgba(0, 0, 0, 0.25),
    0 8px 16px -6px rgba(212, 255, 61, 0.3);
  transition:
    box-shadow 180ms ease,
    transform 120ms ease;
}

.tile-icon-shell {
  background: transparent;
}
.tile-icon-shell-primary {
  background: transparent;
}

.shelf {
  background: var(--color-card);
  box-shadow:
    inset 0 1.5px 3px rgba(0, 0, 0, 0.5),
    inset 0 -1px 0 rgba(255, 255, 255, 0.04),
    0 0 0 1px rgba(0, 0, 0, 0.3);
}

.tile-chevron {
  color: var(--color-ink-muted);
  transition:
    color 180ms ease,
    filter 180ms ease;
}
.tile-shadow:active .tile-chevron,
.row-glow:active .tile-chevron {
  color: var(--color-accent);
  filter: drop-shadow(0 0 6px rgba(212, 255, 61, 0.85))
    drop-shadow(0 0 12px rgba(212, 255, 61, 0.45));
}

.tile-arrow {
  color: var(--color-ink);
  opacity: 0.4;
  transition:
    color 180ms ease,
    opacity 180ms ease,
    filter 180ms ease;
}
.tile-shadow:active .tile-arrow {
  color: var(--color-accent);
  opacity: 1;
  filter: drop-shadow(0 0 6px rgba(212, 255, 61, 0.85))
    drop-shadow(0 0 12px rgba(212, 255, 61, 0.45));
}

.tile-arrow-primary {
  color: var(--color-accent-on);
  opacity: 0.7;
  transition:
    opacity 180ms ease,
    filter 180ms ease;
}
.tile-shadow-primary:active .tile-arrow-primary {
  opacity: 1;
  filter: drop-shadow(0 0 6px rgba(11, 12, 16, 0.5));
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web-client/src/index.css
git commit -m "feat(web-client): css-утилиты плиток для главной"
```

---

## Task 2: Экран `HomePage` + unit-тест

**Files:**

- Create: `apps/web-client/src/pages/HomePage.tsx`
- Create: `apps/web-client/src/pages/HomePage.test.tsx`

- [ ] **Step 1: Создать `HomePage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Dumbbell,
  MessageSquare,
  Settings,
  TrendingUp,
  User,
  UserCog,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useClientMe } from '../api/auth';
import { useClientTrainer } from '../api/trainer';
import { useClientSessions } from '../api/calendar';
import { useClientWorkouts } from '../api/workouts';
import { useClientChatUnread } from '../api/chat';
import { useClientMeasurements } from '../api/measurements';

const DAY_SHORT = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];
const MONTH_FULL = [
  'ЯНВАРЯ',
  'ФЕВРАЛЯ',
  'МАРТА',
  'АПРЕЛЯ',
  'МАЯ',
  'ИЮНЯ',
  'ИЮЛЯ',
  'АВГУСТА',
  'СЕНТЯБРЯ',
  'ОКТЯБРЯ',
  'НОЯБРЯ',
  'ДЕКАБРЯ',
];

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}
function toLocalDate(date: string, hhmm: string): Date {
  const [y, mo, d] = date.split('-');
  const [h, m] = hhmm.split(':');
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(m));
}
function diffShort(future: Date, now: Date): string {
  const ms = future.getTime() - now.getTime();
  if (ms <= 0) return 'СЕЙЧАС';
  const totalMin = Math.round(ms / 60000);
  const totalH = Math.floor(totalMin / 60);
  if (totalH >= 24) {
    const d = Math.floor(totalH / 24);
    const h = totalH % 24;
    return h === 0 ? `${d}Д` : `${d}Д ${h}Ч`;
  }
  const m = totalMin % 60;
  if (totalH === 0) return `${m}М`;
  if (m === 0) return `${totalH}Ч`;
  return `${totalH}Ч ${m}М`;
}

type Metric = { v: string; s: string | string[] };
type TileKey = 'workouts' | 'calendar' | 'chat' | 'progress' | 'trainer' | 'profile';

export function HomePage() {
  const navigate = useNavigate();
  const me = useClientMe();
  const trainer = useClientTrainer();
  const linked = me.data?.link != null;

  const now = new Date();
  const today = isoDate(now);
  const monthAhead = isoDate(new Date(now.getTime() + 30 * 86400000));

  const sessions = useClientSessions(today, monthAhead).data ?? [];
  const workouts = useClientWorkouts().data ?? [];
  const unread = useClientChatUnread().data ?? 0;
  const measurements = useClientMeasurements().data ?? [];

  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // Сессий сегодня (online включительно — клиент посещает все свои занятия).
  const todayCount = sessions.filter((s) => s.date === today).length;
  // Не cancelled на 30 дней (диапазон запроса).
  const plannedNext30d = sessions.filter((s) => s.status !== 'cancelled').length;

  // Ближайшая будущая не-cancelled сессия.
  const nextSession = sessions
    .filter((s) => {
      if (s.status === 'cancelled') return false;
      if (s.date > today) return true;
      if (s.date < today) return false;
      return timeToMinutes(s.startTime) >= nowMinutes;
    })
    .sort((a, b) =>
      a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date),
    )[0];
  const nextSessionDate = nextSession ? toLocalDate(nextSession.date, nextSession.startTime) : null;

  // Есть ли будущая сессия, ждущая подтверждения.
  const pendingExists = sessions.some(
    (s) =>
      s.status !== 'cancelled' &&
      s.clientConfirmation === 'pending' &&
      (s.date > today || (s.date === today && timeToMinutes(s.startTime) >= nowMinutes)),
  );

  const dateLabel = `СЕГОДНЯ · ${DAY_SHORT[now.getDay()]} ${now.getDate()} ${MONTH_FULL[now.getMonth()]}`;
  const trainerName = trainer.data
    ? `${trainer.data.firstName} ${trainer.data.lastName}`.trim()
    : null;
  const clientName = me.data
    ? `${me.data.account.firstName} ${me.data.account.lastName}`.trim()
    : '';

  // Один acid-fill на экран.
  const primaryKey: TileKey | null =
    unread > 0 ? 'chat' : pendingExists ? 'calendar' : !linked ? 'trainer' : null;

  const tiles: Array<{
    key: TileKey;
    title: string;
    sub: string;
    metrics: Metric[];
    Icon: LucideIcon;
    onClick: () => void;
    kicker?: string;
  }> = [
    {
      key: 'workouts',
      title: 'Тренировки',
      sub: 'журнал занятий',
      metrics: [{ v: pad2(workouts.length), s: 'завершено' }],
      Icon: Dumbbell,
      onClick: () => void navigate('/workouts'),
    },
    {
      key: 'calendar',
      title: 'Календарь',
      sub: 'расписание',
      metrics: [{ v: pad2(plannedNext30d), s: 'на 30 дней' }],
      Icon: CalendarDays,
      onClick: () => void navigate('/calendar'),
    },
    {
      key: 'chat',
      title: 'Чат',
      sub: 'тренер на связи',
      metrics: [{ v: pad2(unread), s: 'новых' }],
      Icon: MessageSquare,
      onClick: () => void navigate('/chat'),
    },
    {
      key: 'progress',
      title: 'Прогресс',
      sub: 'замеры и графики',
      metrics: [{ v: pad2(measurements.length), s: 'замеров' }],
      Icon: TrendingUp,
      onClick: () => void navigate('/progress'),
    },
    {
      key: 'trainer',
      title: 'Тренер',
      sub: trainerName ?? 'не подключён',
      metrics: [],
      kicker: linked ? undefined : 'ПОДКЛЮЧИТЬ',
      Icon: UserCog,
      onClick: () => void navigate(linked ? '/profile' : '/connect'),
    },
    {
      key: 'profile',
      title: 'Профиль',
      sub: clientName || 'аккаунт',
      metrics: [],
      Icon: User,
      onClick: () => void navigate('/profile'),
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex flex-1 flex-col overflow-hidden px-5 pb-5 pt-2">
        <div className="font-[family-name:var(--font-mono)] text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-ink-mutedxl)]">
          {dateLabel}
        </div>

        <button
          type="button"
          onClick={() => void navigate('/profile')}
          aria-label="Профиль"
          className="absolute right-5 top-2 z-10 flex items-center justify-center transition-transform active:scale-95"
        >
          <Settings size={20} strokeWidth={1.8} className="text-[var(--color-ink-muted)]" />
        </button>

        <div className="px-1 pb-1 pt-3">
          {linked ? (
            <>
              <button
                type="button"
                onClick={() => void navigate('/calendar')}
                className="flex flex-wrap items-baseline gap-3 text-left transition-transform active:scale-[0.98]"
                aria-label="Открыть календарь на сегодня"
              >
                <span
                  className="font-[family-name:var(--font-display)] text-[64px] leading-none tracking-[-0.03em]"
                  style={{ color: 'var(--color-accent-text)' }}
                >
                  {pad2(todayCount)}
                </span>
                <span className="text-[22px] font-bold leading-tight tracking-[-0.01em]">
                  {todayCount === 1 ? 'занятие сегодня' : 'занятий сегодня'}
                </span>
              </button>

              {nextSession && nextSessionDate && (
                <button
                  type="button"
                  onClick={() => void navigate('/calendar')}
                  aria-label="Открыть календарь"
                  className="mt-3 flex w-full items-center gap-2.5 text-left transition-transform active:scale-[0.98]"
                >
                  <div className="font-[family-name:var(--font-mono)] text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--color-ink-muted)]">
                    СЛЕД. · {nextSession.startTime}
                    {nextSession.title ? ` · ${nextSession.title.toUpperCase()}` : ''}
                  </div>
                  <span className="inline-block rounded bg-[var(--color-accent)] px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[10px] font-bold tracking-[0.06em] text-[var(--color-accent-on)]">
                    {diffShort(nextSessionDate, now)}
                  </span>
                  <ArrowRight
                    size={18}
                    strokeWidth={2.4}
                    style={{ color: 'var(--color-accent)' }}
                    className="shrink-0"
                  />
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={() => void navigate('/connect')}
              className="flex flex-col gap-1 text-left transition-transform active:scale-[0.98]"
              aria-label="Подключить тренера"
            >
              <span
                className="font-[family-name:var(--font-display)] text-[30px] leading-tight tracking-[-0.02em]"
                style={{ color: 'var(--color-accent-text)' }}
              >
                Подключите тренера
              </span>
              <span className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-ink-muted)]">
                чтобы видеть занятия и прогресс
                <ArrowRight size={15} strokeWidth={2.2} style={{ color: 'var(--color-accent)' }} />
              </span>
            </button>
          )}
        </div>

        <div className="mt-4 grid min-h-0 flex-1 grid-cols-2 grid-rows-3 gap-2.5">
          {tiles.map((tile) => {
            const { key, ...rest } = tile;
            return <Tile key={key} {...rest} isPrimary={primaryKey === key} />;
          })}
        </div>
      </div>
    </div>
  );
}

type TileProps = {
  title: string;
  sub: string;
  metrics: Metric[];
  Icon: LucideIcon;
  onClick: () => void;
  isPrimary: boolean;
  kicker?: string;
};

function MetricLabel({ value, color }: { value: string | string[]; color: string }) {
  const cls =
    'font-[family-name:var(--font-mono)] font-bold uppercase tracking-[0.08em] text-[10px] leading-[1.1] whitespace-pre';
  if (Array.isArray(value)) {
    return (
      <span className="inline-flex flex-col" style={{ color }}>
        {value.map((line, i) => (
          <span key={i} className={cls}>
            {line}
          </span>
        ))}
      </span>
    );
  }
  return (
    <span className={cls} style={{ color }}>
      {value}
    </span>
  );
}

function Tile({ title, sub, metrics, Icon, onClick, isPrimary, kicker }: TileProps) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (metrics.length <= 1) return;
    const id = window.setInterval(() => setIdx((x) => (x + 1) % metrics.length), 10000);
    return () => window.clearInterval(id);
  }, [metrics.length]);
  const current = metrics.length > 0 ? (metrics[idx] ?? metrics[0]) : null;
  const labelColor = isPrimary ? 'rgba(11,12,16,0.65)' : 'var(--color-ink-muted)';

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'relative flex h-full min-h-[120px] flex-col rounded-2xl px-3.5 pb-4 pt-3.5 text-left active:scale-[0.97] ' +
        (isPrimary ? 'tile-shadow-primary' : 'tile-shadow')
      }
    >
      <span
        className={`-ml-3 -mt-3 flex h-10 w-10 items-center justify-center rounded-lg ${isPrimary ? 'tile-icon-shell-primary' : 'tile-icon-shell'}`}
      >
        <Icon size={20} strokeWidth={1.8} />
      </span>

      <ArrowUpRight
        size={14}
        className={`absolute right-3.5 top-4 ${isPrimary ? 'tile-arrow-primary' : 'tile-arrow'}`}
        strokeWidth={1.8}
      />

      <span className="flex-1" />

      {kicker && (
        <div
          className="mb-1 font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.16em]"
          style={{ color: isPrimary ? 'rgba(11,12,16,0.55)' : 'var(--color-ink-mutedxl)' }}
        >
          {kicker}
        </div>
      )}

      {current && (
        <div className="mb-1 flex items-center gap-2.5">
          <span className="shrink-0 font-[family-name:var(--font-display)] text-[36px] leading-none tracking-[-0.03em] tabular-nums">
            {current.v}
          </span>
          <MetricLabel value={current.s} color={labelColor} />
        </div>
      )}

      <div className="truncate text-[17px] font-bold leading-tight tracking-[-0.02em]">{title}</div>
      <div
        className="mt-1 truncate text-[11px] font-semibold tracking-[0.01em]"
        style={{ color: isPrimary ? 'rgba(11,12,16,0.55)' : 'var(--color-ink-mutedxl)' }}
      >
        {sub}
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Создать `HomePage.test.tsx`**

Паттерн моков — как в `apps/web-client/src/pages/WorkoutsListPage.test.tsx` (`vi.mock` api-модулей).

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomePage } from './HomePage';
import * as auth from '../api/auth';
import * as trainerApi from '../api/trainer';
import * as calendar from '../api/calendar';
import * as workouts from '../api/workouts';
import * as chat from '../api/chat';
import * as measurements from '../api/measurements';

vi.mock('../api/auth');
vi.mock('../api/trainer');
vi.mock('../api/calendar');
vi.mock('../api/workouts');
vi.mock('../api/chat');
vi.mock('../api/measurements');

function setup(opts: {
  linked: boolean;
  sessions?: unknown[];
  unread?: number;
  workouts?: unknown[];
  measurements?: unknown[];
  trainer?: { firstName: string; lastName: string } | null;
}) {
  vi.mocked(auth.useClientMe).mockReturnValue({
    isLoading: false,
    data: {
      account: {
        id: 'ca1',
        email: 'a@b.co',
        firstName: 'Иван',
        lastName: 'Клиент',
        avatarFileId: null,
      },
      link: opts.linked ? { trainerId: 't1', clientId: 'cl1' } : null,
    },
  } as never);
  vi.mocked(trainerApi.useClientTrainer).mockReturnValue({ data: opts.trainer ?? null } as never);
  vi.mocked(calendar.useClientSessions).mockReturnValue({ data: opts.sessions ?? [] } as never);
  vi.mocked(workouts.useClientWorkouts).mockReturnValue({ data: opts.workouts ?? [] } as never);
  vi.mocked(chat.useClientChatUnread).mockReturnValue({ data: opts.unread ?? 0 } as never);
  vi.mocked(measurements.useClientMeasurements).mockReturnValue({
    data: opts.measurements ?? [],
  } as never);
}

function renderPage() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

describe('HomePage (client)', () => {
  beforeEach(() => vi.resetAllMocks());

  it('привязан: показывает герой-число и плитки', () => {
    setup({
      linked: true,
      sessions: [
        {
          id: 's1',
          clientId: 'cl1',
          workoutId: null,
          date: '2999-01-01',
          startTime: '10:00',
          durationMin: 60,
          location: null,
          title: 'Силовая',
          status: 'planned',
          isOnline: false,
          note: null,
          clientConfirmation: 'confirmed',
        },
      ],
      workouts: [{ id: 'w1' }, { id: 'w2' }],
      measurements: [{ id: 'm1' }],
    });
    renderPage();
    expect(screen.getByText('Тренировки')).toBeInTheDocument();
    expect(screen.getByText('Календарь')).toBeInTheDocument();
    expect(screen.getByText('Прогресс')).toBeInTheDocument();
    // метрика завершённых тренировок = 02
    expect(screen.getByText('02')).toBeInTheDocument();
  });

  it('не привязан: показывает CTA «Подключите тренера»', () => {
    setup({ linked: false });
    renderPage();
    expect(screen.getByText('Подключите тренера')).toBeInTheDocument();
  });

  it('есть непрочитанные → плитка «Чат» primary (acid-fill)', () => {
    setup({ linked: true, unread: 3 });
    renderPage();
    // У primary-плитки класс tile-shadow-primary.
    const chatTile = screen.getByText('Чат').closest('button');
    expect(chatTile?.className).toContain('tile-shadow-primary');
  });
});
```

- [ ] **Step 3: Прогнать типы и тест**

Run: `npm run typecheck && npm run test -w apps/web-client -- HomePage`
Expected: PASS.

> ⚠️ Если `useClientSessions`/`useClientMeasurements` принимают аргументы — вызовы в HomePage остаются как в коде выше (`useClientSessions(today, monthAhead)`, `useClientMeasurements()`); в тесте они замоканы целиком, аргументы не важны. Сверить фактические сигнатуры по `apps/web-client/src/api/calendar.ts` и `measurements.ts`; при расхождении привести вызовы в соответствие.

- [ ] **Step 4: Commit**

```bash
git add apps/web-client/src/pages/HomePage.tsx apps/web-client/src/pages/HomePage.test.tsx
git commit -m "feat(web-client): экран Главная (хаб с плитками)"
```

---

## Task 3: Маршруты и навигация

**Files:**

- Modify: `apps/web-client/src/App.tsx`
- Modify: `apps/web-client/src/components/BottomNav.tsx`
- Modify: `apps/web-client/src/pages/WorkoutDetailPage.tsx`

- [ ] **Step 1: Маршруты в `App.tsx`**

- Добавить импорт: `import { HomePage } from './pages/HomePage';`
- Заменить строку `<Route path="/" element={<WorkoutsListPage />} />` на две строки:

```tsx
        <Route path="/" element={<HomePage />} />
        <Route path="/workouts" element={<WorkoutsListPage />} />
```

(`WorkoutsListPage` остаётся импортированным; `/workouts/:wid` — без изменений.)

- [ ] **Step 2: Нижнее меню — вкладка «Главная»**

В `apps/web-client/src/components/BottomNav.tsx`:

- В импорт иконок добавить `Home` (из `lucide-react`).
- В массиве `ITEMS` заменить первый элемент

```ts
  { to: '/', label: 'Тренировки', Icon: Dumbbell, end: true },
```

на

```ts
  { to: '/', label: 'Главная', Icon: Home, end: true },
```

Если `Dumbbell` больше нигде в файле не используется — убрать его из импорта (ESLint блокирует неиспользуемый импорт).

- [ ] **Step 3: Поправить ссылки «назад» в `WorkoutDetailPage.tsx`**

В `apps/web-client/src/pages/WorkoutDetailPage.tsx` заменить оба `to="/"` (ссылка «назад к списку» и ссылка в пустом/ошибочном состоянии) на `to="/workouts"`, чтобы возврат вёл к списку тренировок, а не на главную.

- [ ] **Step 4: Прогнать типы, линт, тесты**

Run: `npm run typecheck && npm run lint -w apps/web-client 2>/dev/null; npm run test -w apps/web-client`
Expected: типы/тесты зелёные. (Скрипт `lint` в воркспейсе может отсутствовать — линт идёт через корень/pre-commit; ориентир — `npm run typecheck` зелёный.)

- [ ] **Step 5: Commit**

```bash
git add apps/web-client/src/App.tsx apps/web-client/src/components/BottomNav.tsx apps/web-client/src/pages/WorkoutDetailPage.tsx
git commit -m "feat(web-client): маршрут главной + список тренировок на /workouts"
```

---

## Финал

- [ ] Полный `npm run check` зелёный (контроллер).
- [ ] Контроллер: пересборка docker (web-client; api не менялся) + визуальная проверка на 8081:
      главная с героем/плитками; тап «Тренировки» → /workouts; нижнее меню «Главная»;
      состояние «не привязан» (CTA + плитка «Тренер» = ПОДКЛЮЧИТЬ primary).
- [ ] superpowers:finishing-a-development-branch.

## Self-review (план против спеки)

- Хаб на `/`, список → `/workouts`, меню «Главная» → Tasks 2–3 ✓
- Герой: сессии сегодня + строка «следующей»; CTA для непривязанного → Task 2 ✓
- Сетка 2×3 (Тренировки/Календарь/Чат/Прогресс/Тренер/Профиль) с метриками → Task 2 ✓
- Primary: чат>0 → календарь(pending) → тренер(не привязан) → нет → Task 2 ✓
- Порт CSS `tile-*` (иначе плитки без вида) → Task 1 ✓
- Ссылки «назад» деталей тренировки → `/workouts` → Task 3 ✓
- Unit-тест (герой/плитки/primary/непривязан) → Task 2 ✓
- Бэкенд не нужен; правило цвета соблюдено (нет нового красного текста) ✓
