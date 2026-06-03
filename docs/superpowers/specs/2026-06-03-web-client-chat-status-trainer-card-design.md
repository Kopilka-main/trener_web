# Клиентское приложение — статусы сообщений + карточка тренера

Дата: 2026-06-03
Статус: дизайн на ревью
Ветка: `feat-web-design`

## Цель

Доработка после базового чата:

1. **Статусы своих сообщений в чате**: ✓ отправлено / ✓✓ прочитано (тренером).
2. **Карточка тренера у клиента**: после привязки клиент видит профиль своего тренера в разделе «Профиль» и имя тренера в шапке чата.

Заодно — устранение накопившегося дублирования: вынос общего `scope()`-хелпера клиентских фасадов (это уже третий фасад).

## Решения брейншторма (2026-06-03)

- Статусы: только **«отправлено» + «прочитано»**. «Доставлено» — вне объёма (в поллинговой модели без пушей/ack нет чистого сигнала).
- «Прочитано» вычисляется из `conversations.trainerLastReadAt`: сообщение клиента прочитано, если `createdAt ≤ trainerLastReadAt`.
- Карточка тренера: **имя + специализация (title) + «о тренере» (bio) + контакты**. **Без email** (приватность) и **без фото** — у тренера нет аватара в модели данных (`trainers` без `avatarFileId`); фото тренера требует отдельного под-проекта (аватары тренера + отдача файла клиенту).
- Статусы — только на сообщениях клиента; на сообщениях тренера галочек нет.

## Часть 1 — Статусы сообщений

### Бэкенд

- `@trener/shared`: новая `clientChatMessagesResponseSchema = z.object({ messages: z.array(messageResponseSchema), trainerLastReadAt: z.string().nullable() })`. Тренерский `messageListResponseSchema` и общий `messageResponseSchema` НЕ трогаем (статус считается на клиенте, не в каждом сообщении).
- `chat.repo`: `trainerReadAt(trainerId, clientId): Promise<Date | null>` — `findConversation(...)?.trainerLastReadAt ?? null`.
- `chat.service`: `trainerReadAt(trainerId, clientId): Promise<string | null>` — ISO или null.
- Фасад `client-app-chat`: `GET /api/client/chat/messages` теперь возвращает `{ messages, trainerLastReadAt }` (вызывает `listMessages` + `trainerReadAt`). Контракт ответа — `clientChatMessagesResponseSchema`.

### Фронт

- `useClientMessages` возвращает `{ messages: MessageResponse[]; trainerLastReadAt: string | null }` (меняется форма данных хука; `ChatPage` и его smoke-тест обновляются).
- `ChatPage`: на сообщениях `senderRole === 'client'` — иконка статуса: `CheckCheck` акцентным цветом, если `trainerLastReadAt && message.createdAt ≤ trainerLastReadAt` (прочитано); иначе `Check` приглушённым (отправлено). На сообщениях тренера — без иконки.

## Часть 2 — Карточка тренера у клиента

### Контракт (`@trener/shared`)

- `trainerPublicResponseSchema = z.object({ id, firstName, lastName, title: z.string().nullable(), bio: z.string().nullable(), contacts: z.array(contactSchema) })` (без email/passwordHash/avatar). Тип `TrainerPublicResponse`.

### Бэкенд — общий scope-хелпер (рефактор)

- Вынести из `client-app-workouts.routes.ts` и `client-app-chat.routes.ts` дублирующийся `scope(req)` в общий модуль `apps/api/src/core/client-scope.ts`:
  ```
  export type ResolveScope = (clientAccountId: string) => Promise<ClientLink>;
  export function makeClientScope(resolveScope: ResolveScope) {
    return async (req: FastifyRequest): Promise<{ trainerId: string; clientId: string }> => { ... 401 / 409 NOT_LINKED ... };
  }
  ```
  Оба существующих фасада (workouts, chat) переключаются на него; поведение идентично (тесты остаются зелёными).

### Бэкенд — новый фасад `client-app-trainer`

- `GET /api/client/trainer` (`requireClient` → scope) → `{ trainer: TrainerPublicResponse }`. Берёт `trainerId` из scope, читает тренера (`makeAuthRepo(db).findTrainerById`), маппит в публичный вид (отбрасывает email/passwordHash). Если тренер не найден (теоретически) → 404.
- Модуль `registerClientAppTrainerModule(app, { db, resolveScope })` (свой repo не заводит — переиспользует `makeAuthRepo`). Регистрация в `app.ts` рядом с прочими client-app модулями.

### Фронт

- `api/trainer.ts`: `useClientTrainer()` — `GET /client/trainer` → `TrainerPublicResponse`; 409 → null (непривязан).
- **Профиль**: блок «Ваш тренер» (имя + специализация + «о тренере» + контакты) — показывается когда привязан (`me.link !== null`); заменяет/дополняет нынешнюю строку «Вы подключены к тренеру».
- **Чат**: в шапке вместо «Чат» — имя тренера (имя+фамилия); если имя ещё грузится/нет — «Чат».

## Изоляция/ошибки

- `GET /api/client/trainer`: без сессии → 401, без привязки → 409 `NOT_LINKED`. Клиент получает только публичные поля тренера (email/passwordHash не отдаются).
- Статусы: вычисляются из `trainerLastReadAt`, который уже скоуплен парой (trainer, client).

## Тестирование

- **Бэкенд**: chat.repo `trainerReadAt` (null без диалога; дата после markRead тренером); фасад chat — ответ содержит `trainerLastReadAt`, меняется после тренерского markRead; фасад trainer — отдаёт публичный профиль без email, 401/409; общий `makeClientScope` (юнит: 401 без аккаунта, 409 при null, scope при наличии).
- **Фронт**: ChatPage — своё сообщение ✓✓ при прочтении и ✓ без; шапка показывает имя тренера; Профиль — блок тренера при привязке. Обновить существующий ChatPage smoke под новую форму `useClientMessages`.

## Вне объёма

- Фото тренера и фото клиента (требуют аватаров тренера + файлового доступа клиента — отдельный под-проект).
- «Доставлено».
- Статусы на сообщениях тренера; индикатор «печатает»; вебсокеты.

## Инварианты

- `repo` остаётся `trainerId`-скоупленным; клиентские фасады подставляют скоуп через общий `makeClientScope`.
- `*.routes.ts` не импортирует repo (сборка в `*.module.ts`); `core/client-scope.ts` — чистая функция над `resolveScope`, без БД.
- Вход/выход — только Zod-контракты `@trener/shared`. Тренерские роуты/поведение не меняются.
- Email тренера клиенту не отдаётся.
