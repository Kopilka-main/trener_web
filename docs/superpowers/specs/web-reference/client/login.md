# Вход клиента — LoginPage.tsx

**Маршрут:** `/login` · **Точки входа:** редирект `*` → `/login`, когда `useClientMe()` вернул `null` (не залогинен); ссылка «Войти» с экрана `/register`.
**Назначение:** форма входа клиента по email + паролю; при успехе ставит сессионную cookie и переводит в приложение.

## Макет (сверху вниз)

Контейнер: по центру экрана, `max-w-[430px]`, фон `bg`, вертикальный стек с `gap-6`, `px-2`.

1. **Заголовок** «Вход» — `font-display`, 40px, `leading-none`, `tracking-[-0.02em]`, цвет `accent-text`.
2. **Форма** (`flex-col gap-4`, `noValidate`):
   - **Поле Email**: лейбл «Email» (14px medium, `ink-muted`) + `input type=email` (`autocomplete=email`).
     Инпут: `rounded-xl`, `bg-chip`, рамка `border-line` (или `border-danger` при ошибке), текст `ink`, `focus:border-accent`.
     Под полем при ошибке — текст ошибки 12px цвета `danger`.
   - **Поле Пароль**: лейбл «Пароль» + `input type=password` (`autocomplete=current-password`). Та же стилистика.
   - **Серверная ошибка** (если есть): абзац 14px `danger`, `role="alert"`.
   - **Кнопка submit** «Войти»: `rounded-xl`, `bg-accent`, текст `accent-on`, semibold, `py-3`. При отправке `disabled` + `opacity-60`, текст «Входим…».
3. **Низ**: строка «Нет аккаунта? Регистрация» (14px `ink-muted`), ссылка «Регистрация» → `/register` (`accent-text`, medium).

## Данные

| Поле                         | Источник                                                  | Формат |
| ---------------------------- | --------------------------------------------------------- | ------ |
| `email`                      | локальный `useState`                                      | строка |
| `password`                   | локальный `useState`                                      | строка |
| привязка/профиль после входа | инвалидация `['client','me']` → `GET /api/client/auth/me` | —      |

Экран не делает GET-запросов на чтение — только локальное состояние формы и мутация входа.

## Действия

- **Ввод в поля** → обновляют локальный стейт. Валидация в реальном времени, но ошибки показываются только после первой неудачной отправки (`showErrors`).
- **Submit формы** (`handleSubmit`):
  - Если есть клиентские ошибки (`hasErrors`) → `setShowErrors(true)`, запрос НЕ уходит.
  - Иначе → `login.mutate({ email: email.trim(), password })`.
  - **API:** `POST /api/client/auth/login`
    - Тело: `{ email: string, password: string }` (схема `clientLoginRequestSchema`: email нормализуется trim+lowercase, password 1..200).
    - Ответ 200: сервер возвращает `{ account: ClientAccountResponse, token: string }` и ставит httpOnly-cookie `client_session`. **Веб парсит только `{ account }`** (схема `accountEnvelope`), `token` игнорируется (веб на cookie).
    - `ClientAccountResponse`: `{ id, email, firstName, lastName, avatarFileId|null, birthDate|null, contacts[], bio|null }`.
  - **onSuccess:** `invalidateQueries(['client','me'])` → `useClientMe` перечитывает `/api/client/auth/me`, `me.data` становится не-`null`, и `App` рендерит приложение (роуты `/`, `/workouts`…). Явной навигации нет — переключение через смену ветки в `App`.

## Состояния

- **Idle**: пустая форма, ошибок нет.
- **Ошибки валидации** (после первой отправки): «Укажите email» / «Некорректный email» (по regex `^[^\s@]+@[^\s@]+\.[^\s@]+$`); «Укажите пароль». Подсветка рамки `border-danger`.
- **Pending** (`login.isPending`): кнопка disabled, текст «Входим…».
- **Серверная ошибка** (`login.isError`):
  - `ApiError` со `status === 401` → «Неверный email или пароль».
  - другой `ApiError` → его `message`.
  - не-`ApiError` (сетевой сбой) → «Не удалось войти. Попробуйте позже.».
- **Success**: ветка не на этом экране — `App` уходит в приложение.

## Навигация

- «Регистрация» → `/register`.
- Успешный вход → приложение (`/`), через смену состояния `useClientMe`, не через `navigate`.

## Бизнес-правила и edge-cases

- Email перед отправкой проходит `trim()`; пароль — как есть.
- Клиентская валидация лишь гейт перед отправкой; источник истины — сервер (zod на бэке).
- 401 интерпретируется единообразно как «неверные креды» (не раскрываем, email это или пароль).
- Сетевой сбой (fetch reject) — не `ApiError`, поэтому общий текст «Попробуйте позже»; `client.ts` помечает оффлайн (`markOffline`).
- `useClientMe` при `link === null` поллит `/me` каждые 4с (актуально уже после входа на экране подключения, не здесь).

## Сводка эндпоинтов

- `POST /api/client/auth/login` — вход; тело `{ email, password }` → `{ account, token }` (+ cookie `client_session`).
- `GET /api/client/auth/me` — косвенно, через инвалидацию после успеха (определяет, залогинен ли и привязан ли).
