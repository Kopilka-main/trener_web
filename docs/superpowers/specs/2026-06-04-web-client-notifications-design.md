# Уведомления клиентского приложения — дизайн

**Дата:** 2026-06-04
**Раздел:** `apps/web-client` → «Уведомления» (плитка на главной + страница `/notifications`).
**Связано:** [[project_web_client_app]]; образец — тренерская `apps/web/src/pages/NotificationsPage.tsx`.

## Цель

Заменить плитку «Профиль» на главной клиента плиткой «Уведомления» (как у тренера) и добавить
страницу `/notifications` со списком актуальных для клиента уведомлений. Профиль остаётся доступен
через шестерёнку в правом верхнем углу главной.

## Решения (зафиксированы в брейншторме)

1. **Реальные клиентские уведомления** (не заглушка): выводятся на фронте из уже доступных данных,
   отбрасываются в `localStorage`. Новый бэкенд не нужен.
2. **Плитка «Профиль» → «Уведомления»** (Bell) на главной; профиль — через шестерёнку.
3. **Primary-плитка** на главной теперь «Уведомления» при наличии активных уведомлений (единый
   акцент, как у тренера). Следствие: при новом сообщении primary — «Уведомления» (а не «Чат»).

## Источники уведомлений (из существующих хуков, без бэкенда)

`useClientSessions(today, +30д)`, `useClientChatUnread()`:

1. **Подтвердите занятие** — каждое будущее (date+startTime ≥ now) не-cancelled занятие с
   `clientConfirmation === 'pending'`. Текст «Подтвердите занятие <дата, время>», переход → `/calendar`.
   Иконка `CalendarPlus`. id = `confirm:<sessionId>`.
2. **Скоро занятие** — ближайшее будущее не-cancelled занятие в пределах 24 ч от now (если оно НЕ
   попало в «подтвердите», т.е. уже confirmed; pending-занятие уже показано пунктом 1). Текст
   «Скоро занятие: <дата, время>», → `/calendar`. Иконка `Clock`. id = `soon:<sessionId>`.
3. **Новые сообщения** — если `unread > 0`: «Новые сообщения от тренера (N)», → `/chat`. Иконка
   `MessageSquare`. id = `chat`.

Приоритет сортировки: подтверждения → скоро занятие → сообщения.

## Архитектура

### Хелпер `buildClientNotifications` (`apps/web-client/src/lib/notifications.ts`)

Чистая функция (покрыта unit-тестом):

```
type ClientNotification = {
  id: string;
  kind: 'confirm' | 'soon' | 'chat';
  text: string;
  to: string;          // маршрут перехода
};

buildClientNotifications(args: {
  sessions: SessionResponse[];
  unread: number;
  now: Date;
  dismissed: Set<string>;
}): ClientNotification[]
```

- Фильтрует/строит уведомления по правилам выше, исключает `dismissed`, сортирует по приоритету.
- Форматирование даты — локальный хелпер (или переиспользование `parseISO`/`MONTH_GEN` из `lib/calendar`).

### Хранилище dismissed (`localStorage`)

Ключ `client_notifications_dismissed` → JSON-массив id. Загрузка/сохранение с `try/catch`
(как в тренерской `NotificationsPage`: `loadDismissed`/save). Управляется на странице и на главной
через общий маленький хук/функции `loadDismissed()` / `dismiss(id)`.

### Главная (`apps/web-client/src/pages/HomePage.tsx`)

- Подключить `dismissed` (load из localStorage) и вычислить
  `notifications = buildClientNotifications({ sessions, unread, now, dismissed })`.
- Плитку с `key: 'profile'` заменить на `key: 'notifications'`:
  - title «Уведомления», `Icon: Bell`, → `/notifications`;
  - если `notifications.length > 0`: `metrics: [{ v: pad2(count), s: 'новых' }]`, kicker `НОВЫЕ`,
    sub «требуют внимания»;
  - иначе: `metrics: []`, kicker `ВСЁ ТИХО`, sub «нет открытых задач».
- `TileKey`: `profile` → `notifications`.
- **Primary** (новый приоритет): `notifications.length > 0 ? 'notifications' : !linked ? 'trainer' : null`
  (заменяет прежнюю логику chat/calendar/trainer).
- Шестерёнка справа сверху (→ `/profile`) остаётся — единственный вход в профиль.

### Страница `/notifications` (`apps/web-client/src/pages/NotificationsPage.tsx`)

- `<BackBar />` + заголовок «Уведомления».
- `useClientSessions` + `useClientChatUnread` + `dismissed` (state, инициализируется из localStorage).
- Рендер `buildClientNotifications(...)` карточками: иконка по `kind`, текст (тап → `navigate(to)`),
  крестик-dismiss через `HoldToDelete` (добавляет id в dismissed + localStorage + обновляет state).
- Пусто → центрированное «Уведомлений нет».
- Маршрут `/notifications` регистрируется в `App.tsx`.

## Поток данных

1. Главная/страница опрашивают `useClientSessions`/`useClientChatUnread` (polling уже встроен).
2. `buildClientNotifications` формирует список с учётом `dismissed`.
3. Плитка показывает счётчик и становится primary при count > 0.
4. На странице тап по карточке → переход; dismiss → запись в localStorage, карточка исчезает.

## Обработка ошибок / пустые состояния

- Непривязанный клиент (409 → sessions/unread пустые): уведомлений нет, плитка «ВСЁ ТИХО»,
  страница «Уведомлений нет». Плитка «Тренер» остаётся primary (не привязан).
- Битый localStorage → `try/catch` возвращает пустой набор dismissed.
- Без красного текста (правило проекта).

## Тестирование

- Unit-тест `buildClientNotifications`:
  - pending-занятие → уведомление `confirm`; confirmed в пределах 24ч → `soon`;
  - unread > 0 → `chat`; unread = 0 → нет;
  - прошедшие/cancelled занятия игнорируются;
  - dismissed-id исключаются; сортировка по приоритету.
- Unit-тест `HomePage`: плитка «Уведомления» (НЕ «Профиль»); primary = notifications при наличии;
  «ВСЁ ТИХО» при отсутствии.
- Unit-тест `NotificationsPage`: рендер карточек из мок-хуков; пустое состояние.
- `npm run check` зелёный.

## Вне scope

- Бэкенд/пуши/вебсокеты (поллинг как везде).
- Дни рождения и тренерские типы уведомлений.
- Изменения тренерской `HomePage`/`NotificationsPage`.
