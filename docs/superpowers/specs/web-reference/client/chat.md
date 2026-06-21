# Чат клиента — ChatPage.tsx

**Маршрут:** `/chat` · **Точки входа:** плитка «Чат» на главной, плитка/уведомление «Новые сообщения», шапка тренера, deep-link из уведомлений (`to: '/chat'`).
**Назначение:** переписка клиента с привязанным тренером — текст, ответы (reply), задачи с чекбоксом, статусы прочтения, закреплённые сообщения.

## Макет (сверху вниз)

1. **Шапка тренера** (`border-b border-line`): аватар 40×40 (фото
   `/api/client/trainer/avatar?v=<avatarFileId>` или инициалы на `card-elevated`)
   - имя (15px semibold `text-ink`) + `title` тренера (12px `ink-muted`, если есть).
2. **Плашка закреплённых** (если `pinnedMessages.length > 0`): иконка Pin (accent)
   - кикер «Закреплённое» (+ `· N/M` при нескольких) + текст текущего закреплённого
     (truncate). Тап → переход к сообщению + переключение на следующее закреплённое.
3. **Лента сообщений** (`flex-1 overflow-y-auto`, авто-скролл вниз): пузыри по
   типам (см. ниже). Тап по ленте снимает фокус с поля (убирает клавиатуру).
4. **Панель ответа** (если `replyTo`): иконка Reply + «Ответ тренеру/на ваше» +
   текст цитаты + крестик «×» (отмена). Появляется над полем ввода.
5. **Поле ввода** (`shrink-0`, safe-area снизу): авто-растущая textarea (1–3 строки,
   max 80px, `maxLength=4000`) + круглая кнопка ↑ (ArrowUp), видна только когда
   draft непустой.

### Типы пузырей в ленте

- **`kind='system'`** — серая «таблетка» по центру (`bg-chip`, 11px `ink-muted`),
  без аватара/пузыря. Свайп-ответ отключён. Пример: «задача выполнена».
- **`kind='task'`** — карточка слева (`border-accent/40 bg-card`): чекбокс 20×20 +
  кикер «ЗАДАЧА» (accent) + текст + время. Выполненная: чекбокс залит accent с
  галочкой, текст `line-through text-ink-muted`.
- **`kind='text'`** — обычный пузырь. Свои (`senderRole='client'`) справа
  (`bg-accent text-accent-on`), тренерские слева (`bg-card text-ink`). Внутри:
  опц. цитата (ReplyQuote), текст, время + индикатор прочтения (только свои).

## Данные

| Поле                | Источник                                                       | Формат             |
| ------------------- | -------------------------------------------------------------- | ------------------ |
| `linked`            | `useClientMe()` → `link != null`                               | bool (гейт экрана) |
| тренер (шапка)      | `useClientTrainer()` → firstName/lastName/title/avatarFileId   | —                  |
| `messages`          | `useClientMessages()` → `messages[]`                           | MessageResponse[]  |
| `trainerLastReadAt` | `useClientMessages()` → `trainerLastReadAt`                    | ISO\|null          |
| `pinnedMessages`    | `useClientMessages()` → `pinnedMessages` (норм. к `[]`)        | MessageResponse[]  |
| `read` (галочка)    | `readAt !== null && m.createdAt <= readAt`                     | bool               |
| время               | `formatTime(createdAt)` → `toLocaleTimeString('ru-RU', HH:mm)` | «14:30»            |

**MessageResponse:** `id`, `senderRole` (`trainer`\|`client`), `body`, `createdAt`,
`kind` (`text`\|`task`\|`system`), `taskDone` (bool\|null — только для task),
`replyTo` (`{ id, senderRole, body }`\|null — цитата).

## Действия

| Жест/кнопка               | Эффект                                                                                       | API (метод путь, тело → ответ)                                                 | Инвалидации                                  |
| ------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------- |
| Отправка (↑ / submit)     | Шлёт `draft.trim()` (+ `replyTo?.id`); оптимистично чистит поле, при ошибке возвращает текст | `POST /api/client/chat/messages` тело `{ body, replyTo? }` → `{ message }`     | `client/chat/messages`, `client/chat/unread` |
| Свайп влево / цитата      | Ставит `replyTo` (свайп >40px), фокус в поле                                                 | — (локально)                                                                   | —                                            |
| Чекбокс задачи            | Закрывает задачу (однократно, disabled если done/pending)                                    | `POST /api/client/chat/tasks/:id/complete` → `{ message }` (404 «уже закрыта») | `client/chat/messages`, `client/chat/unread` |
| Открытие / новое входящее | Отмечает чат прочитанным                                                                     | `POST /api/client/chat/read` → `{ ok: true }`                                  | `client/chat/unread`                         |
| Тап по закреплённому      | Скролл к сообщению (highlight 1.6с) + след. закреплённое                                     | — (локально)                                                                   | —                                            |
| Тап по цитате/закреп.     | `jumpToMessage(id)` — scrollIntoView + подсветка `bg-accent/10`                              | —                                                                              | —                                            |
| Тап по ленте              | `taRef.blur()` — убрать клавиатуру                                                           | —                                                                              | —                                            |

## Состояния

- **Не подключён** (`!linked`): экран-заглушка «Подключите тренера, чтобы написать
  ему» + ссылка «Подключить тренера» → `/connect`. Лента не грузится.
- **Пустая лента** (`count === 0`): «Сообщений пока нет. Напишите первым.»
- **Отправка в полёте** (`send.isPending`): повторный submit игнорируется, кнопка ↑
  `disabled`.
- **Задача в полёте** (`completeTask.isPending`): чекбоксы disabled.
- **409 (нет тренера)** в `useClientMessages`/`useClientChatUnread`: тихо → пустой
  список / `0`, не ошибка.

## Навигация

заглушка → `/connect`. Внутри экрана навигации по роутам нет — только внутренние
переходы (jump к сообщению, фокус поля).

## Бизнел-правила и edge-cases

- **Поллинг ленты — 4000мс** (`refetchInterval`), плюс `refetchOnWindowFocus` и
  `refetchIntervalInBackground` (счётчики «загораются» даже в фоне PWA).
  При включённом push — обновление мгновенное через PushSync, интервал = фолбэк.
- **Read-receipts:** «прочитано» = сравнение `createdAt <= trainerLastReadAt`.
  Свои сообщения: одна галочка (Check) = доставлено, двойная (CheckCheck) =
  прочитано тренером. У тренерских и task/system галочек нет.
- **Авто-отметка прочтения:** `markRead()` дёргается при `linked` и при смене
  `lastTrainerMsgId` (последнее тренерское сообщение) — т.е. при каждом новом
  входящем.
- **Закреплённые:** массив (видно обоим), показывается по одному с ротацией по
  тапу (`pinIdx % length`). Открепляет только тренер. Старый API может не отдавать
  поле → нормализуется к `[]` (фронт не падает на валидации).
- **Reply:** цитата хранится как `{id, senderRole, body}`; в ленте ReplyQuote
  показывает «Тренер»/«Вы» + тело, тап → jump к оригиналу.
- **Свайп-ответ** (SwipeToReply): срабатывает при горизонтальном свайве влево
  > 40px; вертикальный скролл не перехватывается (`touchAction: pan-y`);
  > для `kind='system'` отключён.
- **Авто-рост поля:** высота = `min(scrollHeight, 80px)`, далее внутренний скролл.
- **Фокус-трюки:** после отправки фокус остаётся в поле; кнопка ↑ гасит
  `onPointerDown` (клавиатура не закрывается); при фокусе лента ~500мс каждый кадр
  прижимается к низу (анимация клавиатуры не «дёргает» ленту).
- Тело сообщения: trim, min 1, max 4000 символов (валидация на бэке и в textarea).

## Сводка эндпоинтов

- `GET /api/client/chat/messages?sinceId?` → `{ messages[], trainerLastReadAt, pinnedMessages? }` — лента (поллинг 4с).
- `POST /api/client/chat/messages` тело `{ body, replyTo? }` → `{ message }` — отправка (+ reply).
- `POST /api/client/chat/tasks/:id/complete` → `{ message }` — закрыть задачу (404 если нет/закрыта).
- `POST /api/client/chat/read` → `{ ok: true }` — отметить прочитанным.
- `GET /api/client/chat/unread` → `{ count }` — счётчик непрочитанных (поллинг 4с).
- `GET /api/client/trainer` → `{ trainer }` — шапка (имя/title/аватар), 409 → null.
- `GET /api/client/trainer/avatar?v=<avatarFileId>` — фото тренера.

## Расхождения мобайла (на момент составления)

- [P1] Проверить наличие **закреплённых** (pinnedMessages) и их ротации по тапу.
- [P1] Проверить **read-receipts** (одна/двойная галочка по `trainerLastReadAt`).
- [P1] Проверить **kind='task'** (чекбокс, закрытие, system-плашка) и **reply**
  (свайп + цитата + jump).
- [P2] Поллинг 4с и авто-`markRead` при новом входящем.
