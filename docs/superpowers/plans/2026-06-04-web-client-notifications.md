# Уведомления клиентского приложения — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить плитку «Профиль» на главной клиента плиткой «Уведомления» (Bell) и добавить страницу `/notifications` со списком актуальных уведомлений (подтверждение занятий, скорое занятие, новые сообщения), отбрасываемых в localStorage. Профиль остаётся доступен через шестерёнку.

**Architecture:** Фронт-онли. Чистый хелпер `buildClientNotifications` выводит уведомления из уже доступных хуков (`useClientSessions`, `useClientChatUnread`). Плитка и страница используют его. Новый бэкенд не нужен.

**Tech Stack:** React 18 + Vite + Tailwind v4 + TanStack Query 5.

**Спека:** `docs/superpowers/specs/2026-06-04-web-client-notifications-design.md`.

---

## Соглашения

- Бэкенда нет → docker/БД не трогаем; сабагент гоняет `npm run typecheck` (корневой) и `npm run test -w apps/web-client`.
- Перед сдачей фронта обязателен `npm run build -w @trener/web-client` (ловит `exactOptionalPropertyTypes`, что `tsc -b` из кэша может пропустить).
- Conventional Commits, без `--no-verify`. ⚠️ commitlint: subject не должен начинаться с аббревиатуры в верхнем регистре.
- Правило цвета: красный только для иконок severity / кнопок реального действия (dismiss в `HoldToDelete` — допустимо).

---

## File Structure

- **Создаю:** `apps/web-client/src/lib/notifications.ts` (хелпер + localStorage).
- **Создаю:** `apps/web-client/src/lib/notifications.test.ts` (unit-тест).
- **Создаю:** `apps/web-client/src/pages/NotificationsPage.tsx` (страница).
- **Создаю:** `apps/web-client/src/pages/NotificationsPage.test.tsx` (unit-тест).
- **Изменяю:** `apps/web-client/src/pages/HomePage.tsx` (плитка Профиль → Уведомления, primary).
- **Изменяю:** `apps/web-client/src/pages/HomePage.test.tsx` (обновить ожидания плитки/primary).
- **Изменяю:** `apps/web-client/src/App.tsx` (маршрут `/notifications`).

---

## Task 1: Хелпер `buildClientNotifications` + unit-тест

**Files:**

- Create: `apps/web-client/src/lib/notifications.ts`
- Test: `apps/web-client/src/lib/notifications.test.ts`

- [ ] **Step 1: Написать падающий тест**

Создать `apps/web-client/src/lib/notifications.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildClientNotifications } from './notifications';
import type { SessionResponse } from '@trener/shared';

function session(over: Partial<SessionResponse>): SessionResponse {
  return {
    id: 's1',
    clientId: 'c1',
    workoutId: null,
    date: '2026-06-10',
    startTime: '10:00',
    durationMin: 60,
    location: null,
    title: null,
    status: 'planned',
    isOnline: false,
    note: null,
    clientConfirmation: 'confirmed',
    ...over,
  };
}

const NOW = new Date('2026-06-10T08:00:00');

describe('buildClientNotifications', () => {
  it('pending будущее занятие → confirm', () => {
    const r = buildClientNotifications({
      sessions: [session({ id: 's1', clientConfirmation: 'pending', date: '2026-06-11' })],
      unread: 0,
      now: NOW,
      dismissed: new Set(),
    });
    expect(r.map((n) => n.kind)).toEqual(['confirm']);
    expect(r[0]?.id).toBe('confirm:s1');
    expect(r[0]?.to).toBe('/calendar');
  });

  it('confirmed занятие в пределах 24ч → soon', () => {
    const r = buildClientNotifications({
      sessions: [
        session({
          id: 's2',
          clientConfirmation: 'confirmed',
          date: '2026-06-10',
          startTime: '20:00',
        }),
      ],
      unread: 0,
      now: NOW,
      dismissed: new Set(),
    });
    expect(r.map((n) => n.kind)).toEqual(['soon']);
    expect(r[0]?.id).toBe('soon:s2');
  });

  it('unread > 0 → chat; 0 → нет', () => {
    const withChat = buildClientNotifications({
      sessions: [],
      unread: 2,
      now: NOW,
      dismissed: new Set(),
    });
    expect(withChat.map((n) => n.kind)).toEqual(['chat']);
    expect(withChat[0]?.id).toBe('chat');
    const none = buildClientNotifications({
      sessions: [],
      unread: 0,
      now: NOW,
      dismissed: new Set(),
    });
    expect(none).toEqual([]);
  });

  it('прошедшие и cancelled игнорируются', () => {
    const r = buildClientNotifications({
      sessions: [
        session({ id: 'past', clientConfirmation: 'pending', date: '2026-06-09' }),
        session({
          id: 'canc',
          clientConfirmation: 'pending',
          status: 'cancelled',
          date: '2026-06-12',
        }),
      ],
      unread: 0,
      now: NOW,
      dismissed: new Set(),
    });
    expect(r).toEqual([]);
  });

  it('dismissed-id исключается; порядок confirm → soon → chat', () => {
    const sessions = [
      session({ id: 'p', clientConfirmation: 'pending', date: '2026-06-11' }),
      session({ id: 's', clientConfirmation: 'confirmed', date: '2026-06-10', startTime: '20:00' }),
    ];
    const all = buildClientNotifications({ sessions, unread: 1, now: NOW, dismissed: new Set() });
    expect(all.map((n) => n.kind)).toEqual(['confirm', 'soon', 'chat']);
    const filtered = buildClientNotifications({
      sessions,
      unread: 1,
      now: NOW,
      dismissed: new Set(['confirm:p']),
    });
    expect(filtered.map((n) => n.kind)).toEqual(['soon', 'chat']);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npm run test -w apps/web-client -- notifications`
Expected: FAIL (модуля нет).

- [ ] **Step 3: Реализовать `notifications.ts`**

Создать `apps/web-client/src/lib/notifications.ts`:

```ts
import type { SessionResponse } from '@trener/shared';
import { MONTH_GEN, parseISO } from './calendar';

export type ClientNotificationKind = 'confirm' | 'soon' | 'chat';

export interface ClientNotification {
  id: string;
  kind: ClientNotificationKind;
  text: string;
  to: string;
}

const DISMISSED_KEY = 'client_notifications_dismissed';

/** Отброшенные уведомления из localStorage (битый JSON → пусто). */
export function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

/** Добавить id в отброшенные, сохранить, вернуть новый набор. */
export function dismissNotification(id: string): Set<string> {
  const next = loadDismissed();
  next.add(id);
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]));
  } catch {
    // localStorage недоступен — молча игнорируем.
  }
  return next;
}

function startMs(s: SessionResponse): number {
  const d = parseISO(s.date);
  const [h, m] = s.startTime.split(':').map(Number);
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d.getTime();
}

function whenLabel(s: SessionResponse): string {
  const d = parseISO(s.date);
  return `${String(d.getDate())} ${MONTH_GEN[d.getMonth()] ?? ''}, ${s.startTime}`;
}

/** Уведомления клиента из доступных данных. Чистая функция (без localStorage). */
export function buildClientNotifications(args: {
  sessions: SessionResponse[];
  unread: number;
  now: Date;
  dismissed: Set<string>;
}): ClientNotification[] {
  const { sessions, unread, now, dismissed } = args;
  const nowMs = now.getTime();
  const out: ClientNotification[] = [];

  const future = sessions
    .filter((s) => s.status !== 'cancelled' && startMs(s) >= nowMs)
    .sort((a, b) => startMs(a) - startMs(b));

  // 1) Подтверждения (каждое pending-занятие).
  for (const s of future) {
    if (s.clientConfirmation === 'pending') {
      out.push({
        id: `confirm:${s.id}`,
        kind: 'confirm',
        text: `Подтвердите занятие ${whenLabel(s)}`,
        to: '/calendar',
      });
    }
  }

  // 2) Скоро занятие — ближайшее НЕ pending в пределах 24ч.
  const soon = future.find(
    (s) => s.clientConfirmation !== 'pending' && startMs(s) - nowMs <= 24 * 3600 * 1000,
  );
  if (soon) {
    out.push({
      id: `soon:${soon.id}`,
      kind: 'soon',
      text: `Скоро занятие: ${whenLabel(soon)}`,
      to: '/calendar',
    });
  }

  // 3) Новые сообщения.
  if (unread > 0) {
    out.push({
      id: 'chat',
      kind: 'chat',
      text: `Новые сообщения от тренера (${String(unread)})`,
      to: '/chat',
    });
  }

  return out.filter((n) => !dismissed.has(n.id));
}
```

- [ ] **Step 4: Запустить — зелёный**

Run: `npm run test -w apps/web-client -- notifications`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web-client/src/lib/notifications.ts apps/web-client/src/lib/notifications.test.ts
git commit -m "feat(web-client): хелпер клиентских уведомлений"
```

---

## Task 2: Страница `/notifications` + маршрут + тест

**Files:**

- Create: `apps/web-client/src/pages/NotificationsPage.tsx`
- Create: `apps/web-client/src/pages/NotificationsPage.test.tsx`
- Modify: `apps/web-client/src/App.tsx`

- [ ] **Step 1: Создать `NotificationsPage.tsx`**

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarPlus, Clock, MessageSquare } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useClientSessions } from '../api/calendar';
import { useClientChatUnread } from '../api/chat';
import { BackBar } from '../components/BackBar';
import { HoldToDelete } from '../components/HoldToDelete';
import { toISODate } from '../lib/calendar';
import {
  buildClientNotifications,
  dismissNotification,
  loadDismissed,
  type ClientNotificationKind,
} from '../lib/notifications';

const ICONS: Record<ClientNotificationKind, LucideIcon> = {
  confirm: CalendarPlus,
  soon: Clock,
  chat: MessageSquare,
};

export function NotificationsPage() {
  const navigate = useNavigate();
  const now = new Date();
  const from = toISODate(now);
  const to = toISODate(new Date(now.getTime() + 30 * 86400000));

  const sessions = useClientSessions(from, to).data ?? [];
  const unread = useClientChatUnread().data ?? 0;
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed());

  const items = buildClientNotifications({ sessions, unread, now, dismissed });

  return (
    <div className="flex h-full flex-col">
      <div className="px-4">
        <BackBar />
      </div>
      <h1 className="px-4 pt-2 font-[family-name:var(--font-display)] text-[24px] text-ink">
        Уведомления
      </h1>

      <div className="flex flex-1 flex-col gap-2 px-4 pb-6 pt-3">
        {items.length === 0 ? (
          <p className="m-auto text-sm text-ink-muted">Уведомлений нет.</p>
        ) : (
          items.map((n) => {
            const Icon = ICONS[n.kind];
            return (
              <div key={n.id} className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3">
                <button
                  type="button"
                  onClick={() => void navigate(n.to)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-80"
                >
                  <Icon size={18} strokeWidth={2} className="shrink-0 text-accent" />
                  <span className="min-w-0 flex-1 text-[14px] text-ink">{n.text}</span>
                </button>
                <HoldToDelete
                  onDelete={() => setDismissed(dismissNotification(n.id))}
                  label="Удерживайте, чтобы убрать уведомление"
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Маршрут в `App.tsx`**

- Импорт: `import { NotificationsPage } from './pages/NotificationsPage';`
- Добавить маршрут рядом с прочими (перед `<Route path="*" ...>`):

```tsx
<Route path="/notifications" element={<NotificationsPage />} />
```

- [ ] **Step 3: Тест `NotificationsPage.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NotificationsPage } from './NotificationsPage';
import * as calendar from '../api/calendar';
import * as chat from '../api/chat';

vi.mock('../api/calendar');
vi.mock('../api/chat');

function renderPage() {
  return render(
    <MemoryRouter>
      <NotificationsPage />
    </MemoryRouter>,
  );
}

describe('NotificationsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
  });

  it('пусто → «Уведомлений нет»', () => {
    vi.mocked(calendar.useClientSessions).mockReturnValue({ data: [] } as never);
    vi.mocked(chat.useClientChatUnread).mockReturnValue({ data: 0 } as never);
    renderPage();
    expect(screen.getByText('Уведомлений нет.')).toBeInTheDocument();
  });

  it('непрочитанные → карточка о сообщениях', () => {
    vi.mocked(calendar.useClientSessions).mockReturnValue({ data: [] } as never);
    vi.mocked(chat.useClientChatUnread).mockReturnValue({ data: 3 } as never);
    renderPage();
    expect(screen.getByText(/Новые сообщения от тренера/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Прогон**

Run: `npm run test -w apps/web-client -- NotificationsPage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web-client/src/pages/NotificationsPage.tsx apps/web-client/src/pages/NotificationsPage.test.tsx apps/web-client/src/App.tsx
git commit -m "feat(web-client): страница уведомлений + маршрут"
```

---

## Task 3: Плитка «Профиль» → «Уведомления» на главной + тесты

**Files:**

- Modify: `apps/web-client/src/pages/HomePage.tsx`
- Modify: `apps/web-client/src/pages/HomePage.test.tsx`

- [ ] **Step 1: Правки `HomePage.tsx`**

1. Импорт иконок: добавить `Bell`, убрать `User` (плитка профиля удаляется; шестерёнка использует `Settings`). Строка импорта lucide становится, например:

```tsx
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Dumbbell,
  MessageSquare,
  Settings,
  TrendingUp,
  UserCog,
} from 'lucide-react';
```

2. Добавить импорт хелпера:

```tsx
import { buildClientNotifications, loadDismissed } from '../lib/notifications';
```

3. Тип `TileKey`: заменить `'profile'` на `'notifications'`:

```tsx
type TileKey = 'workouts' | 'calendar' | 'chat' | 'progress' | 'trainer' | 'notifications';
```

4. Вычислить уведомления (после получения `sessions`/`unread`, рядом с прочими расчётами). Удалить
   расчёт `pendingExists` (он больше не нужен — заменяется уведомлениями):

```tsx
const notifications = buildClientNotifications({
  sessions,
  unread,
  now,
  dismissed: loadDismissed(),
});
```

5. Заменить `primaryKey`:

```tsx
const primaryKey: TileKey | null =
  notifications.length > 0 ? 'notifications' : !linked ? 'trainer' : null;
```

6. Заменить плитку `key: 'profile'` на плитку уведомлений:

```tsx
    {
      key: 'notifications',
      title: 'Уведомления',
      sub: notifications.length > 0 ? 'требуют внимания' : 'нет открытых задач',
      metrics: notifications.length > 0 ? [{ v: pad2(notifications.length), s: 'новых' }] : [],
      kicker: notifications.length > 0 ? 'НОВЫЕ' : 'ВСЁ ТИХО',
      Icon: Bell,
      onClick: () => void navigate('/notifications'),
    },
```

(Профиль остаётся доступен через шестерёнку справа сверху — её не трогаем.)

- [ ] **Step 2: Обновить `HomePage.test.tsx`**

- В тесте «привязан: показывает герой-число и плитки» заменить проверку плитки `Профиль`/`Прогресс`
  на наличие плитки **«Уведомления»** (и убедиться, что «Профиль» больше не плитка):

```tsx
expect(screen.getByText('Уведомления')).toBeInTheDocument();
expect(screen.queryByText('Профиль')).not.toBeInTheDocument();
```

- Тест «есть непрочитанные → плитка primary» теперь должен проверять, что primary — **«Уведомления»**
  (т.к. непрочитанные порождают уведомление):

```tsx
it('есть непрочитанные → плитка «Уведомления» primary (acid-fill)', () => {
  setup({ linked: true, unread: 3 });
  renderPage();
  const tile = screen.getByText('Уведомления').closest('button');
  expect(tile?.className).toContain('tile-shadow-primary');
});
```

> ⚠️ Тест использует `localStorage` (через `loadDismissed`). В `beforeEach` добавить `localStorage.clear();`,
> чтобы отброшенные из других тестов не влияли.

- [ ] **Step 3: Прогон типов/тестов/сборки**

Run: `npm run typecheck && npm run test -w apps/web-client -- HomePage && npm run build -w @trener/web-client`
Expected: всё зелёное.

- [ ] **Step 4: Commit**

```bash
git add apps/web-client/src/pages/HomePage.tsx apps/web-client/src/pages/HomePage.test.tsx
git commit -m "feat(web-client): плитка «Уведомления» на главной вместо «Профиль»"
```

---

## Финал

- [ ] Полный `npm run check` зелёный (контроллер).
- [ ] `npm run build -w @trener/web-client` зелёный (контроллер).
- [ ] Контроллер: пересборка docker web-client + визуальная проверка на 8081:
      назначенное занятие без подтверждения и/или новое сообщение → плитка «Уведомления» становится
      primary со счётчиком; страница `/notifications` показывает карточки; dismiss убирает; тап ведёт
      в нужный раздел; профиль открывается шестерёнкой.
- [ ] superpowers:finishing-a-development-branch.

## Self-review (план против спеки)

- Хелпер `buildClientNotifications` (confirm/soon/chat, dismissed, порядок) + тест → Task 1 ✓
- localStorage `loadDismissed`/`dismissNotification` → Task 1 ✓
- Страница `/notifications` (карточки, dismiss, пусто, BackBar) + маршрут + тест → Task 2 ✓
- Плитка Профиль → Уведомления (Bell, счётчик, ВСЁ ТИХО) → Task 3 ✓
- Primary = notifications при наличии, иначе trainer при отсутствии привязки → Task 3 ✓
- Профиль через шестерёнку (не трогаем) → Task 3 ✓
- Обновление существующих HomePage-тестов (primary → Уведомления; Профиль не плитка) → Task 3 ✓
- Правило цвета (dismiss-иконка допустима, нового красного текста нет) ✓
- exactOptionalPropertyTypes: `kicker` всегда строка (без условного undefined) ✓
