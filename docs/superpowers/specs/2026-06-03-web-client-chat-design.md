# Клиентское приложение — раздел «Чат», v1

Дата: 2026-06-03
Статус: дизайн на ревью
Ветка: `feat-web-design`

## Цель

Дать клиенту переписку с тренером: видеть ленту сообщений, писать, видеть новые (поллинг), отмечать прочитанное и видеть бейдж непрочитанных на вкладке «Чат». Тренерская сторона чата уже существует — здесь только клиентский фасад + клиентская модель прочтения.

## Решения брейншторма (2026-06-03)

- v1 = просмотр + отправка + **прочитано/бейдж непрочитанных** (требует колонку `conversations.clientLastReadAt`).
- Реал-тайм — **поллингом** (TanStack Query `refetchInterval`), как везде в приложении. Вебсокеты — вне объёма.
- Чат требует тренера: непривязанный клиент видит приглашение подключиться (409 `NOT_LINKED` → мягкое состояние).
- Вне объёма: вложения/файлы, «печатает», тренерская сторона.

## Модель данных

Существующее: `conversations` (trainerId, clientId, lastMessageAt, **trainerLastReadAt**, createdAt), `messages` (conversationId, **senderRole** 'trainer'|'client', body, createdAt).

Изменение (миграция drizzle): `conversations` += `clientLastReadAt timestamptz null` — момент последнего прочтения клиентом (для непрочитанных от тренера). Симметрично `trainerLastReadAt`.

## Бэкенд

### Доработка существующего chat-модуля

- `chat.repo.addMessage(trainerId, clientId, messageId, body, now, senderRole)` — добавить параметр `senderRole: 'trainer' | 'client'` (сейчас хардкод `'trainer'`). Вставлять с переданной ролью.
- `chat.service.sendMessage(trainerId, clientId, input, senderRole = 'trainer')` — пробрасывает роль в repo. **Тренерские роуты вызывают без аргумента → `'trainer'`, поведение не меняется.**
- `chat.repo.markReadByClient(trainerId, clientId, now)` — getOrCreate диалог, `set clientLastReadAt = now`.
- `chat.repo.clientUnreadCount(trainerId, clientId)` — число `messages` в диалоге с `senderRole = 'trainer'` и (`clientLastReadAt IS NULL` OR `createdAt > clientLastReadAt`). Нет диалога → 0.
- `chat.service`: `markReadByClient(...)`, `clientUnread(...)` поверх repo.

### Новый модуль-фасад `apps/api/src/modules/client-app-chat/`

Паттерн как `client-app-workouts`: `requireClient` → `scope(req)` (resolveScope; `null` → 409 `NOT_LINKED`; нет сессии → 401) → существующий `chat` service с подставленным `{trainerId, clientId}`. Свой repo не заводит — строит `makeChatService(makeChatRepo(db), clock)`; `resolveScope` приходит из composition root (из client-auth svc).

Роуты:

- `GET /api/client/chat/messages` (опц. `?sinceId=`) → `{ messages: MessageResponse[] }` (reuse `listMessages`).
- `POST /api/client/chat/messages` (body `sendMessageRequestSchema`) → `{ message: MessageResponse }` — `sendMessage(..., 'client')`.
- `POST /api/client/chat/read` → `{ ok: true }` — `markReadByClient`.
- `GET /api/client/chat/unread` → `{ count: number }` — `clientUnread`.

Контракты переиспользуются из `@trener/shared` (`messageResponseSchema`, `messageListResponseSchema`, `sendMessageRequestSchema`); для unread — локальная `z.object({ count: z.number() })`.

### Изоляция/ошибки

- Клиент видит/пишет только в свой диалог (скоуп из сессии; `clientId`/`trainerId` не из тела).
- Без сессии → 401; без привязки → 409 `NOT_LINKED`.
- `senderRole` сообщений клиента — всегда `'client'` (задаётся сервером, не клиентом).

## Фронтенд (`apps/web-client`)

### API (`src/api/chat.ts`)

- `useClientMessages()` — список, `refetchInterval` ~4000 (живая лента). 409 → пусто (не ошибка).
- `useSendClientMessage()` — POST, при успехе инвалидирует список (+ unread).
- `useMarkChatRead()` — POST read; инвалидирует unread.
- `useClientChatUnread()` — `{count}`, `refetchInterval` ~10000 (бейдж). 409 → 0.

### Экран «Чат» (вкладка `/chat`, заменяет заглушку)

- Лента: пузыри сообщений — `senderRole==='client'` справа (акцентный фон), `'trainer'` слева (карточный фон); время под сообщением; автоскролл вниз к свежим. Пусто (привязан) → «Сообщений пока нет».
- Непривязан → «Подключите тренера, чтобы написать» (+ ссылка/намёк на /connect; на этот экран попадают и непривязанные, т.к. тренер опционален).
- Поле ввода + кнопка отправки (disabled при пустом/в процессе); Enter — отправка.
- При монтировании (и когда есть непрочитанные) — `markRead`.

### Бейдж на вкладке «Чат» (нижняя навигация)

- `BottomNav` использует `useClientChatUnread()`; при `count > 0` — точка/число на иконке «Чат». После открытия чата (`markRead`) → 0 (через инвалидацию).

## Тестирование

- **Бэкенд**: `addMessage` пишет переданную роль; `sendMessage` default 'trainer' (тренерское поведение не сломано); `markReadByClient` ставит clientLastReadAt; `clientUnreadCount` считает только сообщения тренера после прочтения; изоляция (чужой диалог недоступен); 409/401. Прогон с БД.
- **Фронт**: smoke ленты (пузыри по ролям, пустое/непривязанное состояние), отправка (мутация с body), бейдж (count>0 рендерит индикатор).

## Инварианты

- `repo` остаётся `trainerId`-скоупленным; клиентский фасад подставляет скоуп через `resolveScope`.
- `*.routes.ts` не импортирует repo (сборка в `*.module.ts`).
- Вход/выход — только Zod-контракты `@trener/shared`.
- Тренерские chat-роуты и поведение не меняются (senderRole default).
