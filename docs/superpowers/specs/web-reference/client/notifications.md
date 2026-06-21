# Уведомления клиента — NotificationsPage.tsx

**Маршрут:** `/notifications` · **Точки входа:** плитка «Уведомления» на главной.
**Назначение:** агрегированная лента «что требует внимания» — подтверждения занятий,
скорые занятия, заканчивающиеся пакеты, новые сообщения, назначенные тренировки и
задачи на замеры, плюс открытые задачи из чата.

## Макет (сверху вниз)

1. **Заголовок** «Уведомления» (`font-display`, 24px `text-ink`).
2. **Открытые задачи из чата** (`openTasks`, карточки `border-accent/40 bg-card`):
   чекбокс 20×20 (закрыть задачу) + кикер «ЗАДАЧА» (accent) + текст. Тап по тексту
   → `/chat`.
3. **Лента уведомлений** (`items`, карточки `bg-card`): иконка по `kind` (accent) +
   текст + контрол **HoldToDelete** (удержание — скрыть уведомление в dismissed).
4. **SessionSheet** (шторка подтверждения занятия) — открывается поверх при тапе по
   confirm-уведомлению.

Иконки по `kind`: `confirm`→CalendarPlus, `soon`→Clock, `chat`→MessageSquare,
`package`→Wallet, `workout`→Dumbbell, `measure`→Ruler.

## Данные

| Источник              | Хук                              | Назначение                     |
| --------------------- | -------------------------------- | ------------------------------ |
| сессии (−30…+30 дней) | `useClientSessions(from,to)`     | confirm/soon                   |
| непрочитанные         | `useClientChatUnread()`          | chat-уведомление               |
| пакеты                | `useClientPackages()`            | package-уведомление            |
| тренировки            | `useClientWorkouts()`            | workout-уведомление            |
| задачи на замеры      | `useClientMeasurementTasks()`    | measure-уведомление            |
| лента сообщений       | `useClientMessages()`            | openTasks (kind='task', !done) |
| dismissed             | `loadDismissed()` (localStorage) | скрытые уведомления            |

`buildClientNotifications(...)` — **чистая функция** (без localStorage), собирает
`ClientNotification[]` и фильтрует по `dismissed`. Принимает `{ sessions, unread,
now, dismissed, packages?, workouts?, measurementTasks? }`.

**ClientNotification:** `id`, `kind`, `text`, `to` (маршрут), `sessionId?` (для confirm).

## Логика buildClientNotifications (порядок добавления)

0. **workout** — для каждой тренировки `!createdByClient && status==='draft'`:
   `id='workout:<id>'`, текст «Новая тренировка от тренера: <name>», `to='/workouts'`.
   0b. **measure** — для каждой `measurementTask` (бэк отдаёт только открытые):
   `id='measure:<id>'`, текст «Тренер просит сделать замеры[: <note>]»,
   `to='/progress?tab=measurements'`.
1. **confirm** — каждое **будущее** не-cancelled занятие с `clientConfirmation==='pending'`:
   `id='confirm:<id>'`, текст «Подтвердите занятие <дата, время>», `to='/calendar'`,
   `sessionId`.
   1b. **confirm (задним числом)** — занятия `status==='completed' && clientConfirmation
   ==='pending'`, начавшиеся в последние **30 дней** (не будущие): текст «Подтвердите
   проведённую тренировку …». Тот же `id='confirm:<id>'`.
2. **soon** — **первое** будущее не-pending занятие в пределах **24ч**:
   `id='soon:<id>'`, текст «Скоро занятие: …», `to='/calendar'`.
3. **package** — активные пакеты с остатком `lessonsPaid − lessonsUsed ≤ 2`
   (`PACKAGE_LOW_THRESHOLD`): ≤0 → «Пакет[«type»] закончился — обратитесь к тренеру»,
   иначе «… заканчивается: осталось N». `to='/chat'`.
4. **chat** — если `unread > 0`: `id='chat'`, текст «Новые сообщения от тренера (N)»,
   `to='/chat'`.

Финал: `out.filter((n) => !dismissed.has(n.id))`.

## Действия

| Жест/кнопка                | Эффект                                                                      | API                                                        | Инвалидации                                  |
| -------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------- |
| Чекбокс open-task          | Закрыть задачу из чата                                                      | `POST /api/client/chat/tasks/:id/complete` → `{ message }` | `client/chat/messages`, `client/chat/unread` |
| Тап по open-task           | → `/chat`                                                                   | —                                                          | —                                            |
| Тап по confirm-уведомлению | Открыть `SessionSheet` (если сессия найдена), иначе → `n.to` (`/calendar`)  | — (шторка локально)                                        | —                                            |
| Тап по прочим уведомлениям | → `n.to`                                                                    | —                                                          | —                                            |
| HoldToDelete (удержание)   | `dismissNotification(n.id)` → запись в localStorage, обновление `dismissed` | — (localStorage)                                           | —                                            |
| **Уход со страницы**       | если `unread > 0` — отметить чат прочитанным (при размонтировании)          | `POST /api/client/chat/read` → `{ ok: true }`              | `client/chat/unread`                         |

## Состояния

- **Пусто** (`items.length === 0 && openTasks.length === 0`): «Уведомлений нет.»
  (по центру, `ink-muted`).
- **409 (не привязан)** в хуках сессий/чата/пакетов/тренировок/замеров: тихо →
  пустые данные, не ошибка.
- Открытые задачи и обычные уведомления могут показываться вместе (задачи сверху).

## Навигация

open-task → `/chat` · confirm → `SessionSheet` (или `/calendar`) · soon → `/calendar`
· workout → `/workouts` · measure → `/progress?tab=measurements` · package/chat →
`/chat`.

## Бизнес-правила и edge-cases

- **dismissed — localStorage** (ключ `client_notifications_dismissed`, массив id):
  `loadDismissed()` (битый JSON → пусто), `dismissNotification(id)` добавляет +
  сохраняет. Фильтр по `id`, поэтому **`confirm:<id>` (будущее и задним числом)
  делят один id** — скрытие убирает оба варианта.
- **Окно сессий −30…+30 дней:** назад 30 дней — чтобы проведённые задним числом
  занятия (confirm) попадали в выборку и открывались в шторке.
- **measure-задачи:** бэкенд возвращает только открытые (`/client/measurement-tasks`),
  текст с `note` если он непустой.
- **Авто-`markRead` при уходе:** карточка «Новые сообщения» остаётся видимой и
  кликабельной всё время просмотра; отметка прочитанным — в cleanup-эффекте при
  размонтировании (через `unreadRef`, чтобы взять актуальное значение), чтобы
  сбросить плитку «Уведомления»/счётчик на главной.
- **soon** добавляется только одно (ближайшее) и только если занятие не-pending и
  ≤24ч; pending-занятия уже покрыты confirm (п.1).
- **package:** `workoutType` подставляется в «Пакет «<type>»», иначе просто «Пакет».

## Сводка эндпоинтов

- `GET /api/client/sessions?from&to` → сессии (−30…+30 дней) — confirm/soon.
- `GET /api/client/chat/unread` → `{ count }` — chat-уведомление.
- `GET /api/client/packages` → пакеты — package-уведомление.
- `GET /api/client/workouts` → тренировки — workout-уведомление.
- `GET /api/client/measurement-tasks` → `{ tasks }` — measure-уведомление (только открытые).
- `GET /api/client/chat/messages` → `{ messages[], … }` — openTasks (kind='task', !done).
- `POST /api/client/chat/tasks/:id/complete` → `{ message }` — закрыть задачу.
- `POST /api/client/chat/read` → `{ ok: true }` — отметить чат прочитанным (при уходе).

## Расхождения мобайла (на момент составления)

- [P1] Проверить полноту источников `buildClientNotifications` (workout/measure —
  часто забывают на мобайле).
- [P1] Проверить **dismissed** (локальное скрытие, общий id у confirm) и
  **HoldToDelete**.
- [P1] Проверить открытие **SessionSheet** прямо из confirm-уведомления (а не
  переброс в календарь).
- [P2] Авто-`markRead` при уходе со страницы.
