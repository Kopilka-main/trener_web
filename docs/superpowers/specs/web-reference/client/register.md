# Регистрация клиента — RegisterPage.tsx

**Маршрут:** `/register` · **Точки входа:** ссылка «Регистрация» с экрана `/login` (доступно только когда не залогинен; иначе `*` → `/login`).
**Назначение:** создание клиентского аккаунта (имя, фамилия, email, пароль); при успехе ставит сессию и переводит в приложение.

## Макет (сверху вниз)

Контейнер: по центру, `max-w-[430px]`, фон `bg`, `gap-6`, `px-2 py-8`.

1. **Заголовок** «Регистрация» — `font-display`, 36px, `leading-none`, `tracking-[-0.02em]`, `accent-text`.
2. **Форма** (`flex-col gap-4`, `noValidate`), четыре одинаковых поля (хелпер `field`):
   - **Имя** (`autocomplete=given-name`).
   - **Фамилия** (`autocomplete=family-name`).
   - **Email** (`type=email`, `autocomplete=email`).
   - **Пароль** (`type=password`, `autocomplete=new-password`).
     Каждое поле: лейбл 14px medium `ink-muted`; инпут `rounded-xl bg-chip border-line` (или `border-danger`), текст `ink`, `focus:border-accent`; ошибка под полем 12px `danger`.
   - **Серверная ошибка** (если есть, не EMAIL_TAKEN): абзац 14px `danger`, `role="alert"`.
   - **Кнопка submit** «Создать аккаунт»: `rounded-xl bg-accent`, текст `accent-on`, semibold, `py-3`; в pending — disabled `opacity-60`, текст «Создаём…».
3. **Низ**: «Уже есть аккаунт? Войти», ссылка «Войти» → `/login` (`accent-text`).

## Данные

| Поле                               | Источник                                                  | Формат |
| ---------------------------------- | --------------------------------------------------------- | ------ |
| `firstName`                        | локальный `useState`                                      | строка |
| `lastName`                         | локальный `useState`                                      | строка |
| `email`                            | локальный `useState`                                      | строка |
| `password`                         | локальный `useState`                                      | строка |
| профиль/привязка после регистрации | инвалидация `['client','me']` → `GET /api/client/auth/me` | —      |

GET-чтений нет — только локальный стейт и мутация регистрации.

## Действия

- **Ввод в поля** → локальный стейт. Ошибки полей показываются после первой неудачной отправки (`showErrors`).
- **Ввод в Email** дополнительно сбрасывает мутацию (`reg.reset()`), если был предыдущий error — чтобы убрать плашку «Email уже зарегистрирован».
- **Submit** (`handleSubmit`):
  - Если `hasErrors` → `setShowErrors(true)`, запрос не уходит.
  - Иначе → `reg.mutate({ firstName, lastName, email, password })` (имя/фамилия/email c `trim()`, пароль как есть).
  - **API:** `POST /api/client/auth/register`
    - Тело: `{ email, password, firstName, lastName }` (схема `clientRegisterRequestSchema`: email trim+lowercase; password 8..200; firstName/lastName trim 1..100).
    - Ответ 201: сервер `{ account: ClientAccountResponse, token }` + ставит httpOnly-cookie `client_session`. **Веб парсит только `{ account }`**, `token` игнорируется.
  - **onSuccess:** ставит `localStorage['push-prompt-pending'] = '1'` (потом `PushPrompt` предложит включить пуш); `invalidateQueries(['client','me'])` → `useClientMe` перечитывает `/me`, `App` уходит в приложение. Явного `navigate` нет.

## Состояния

- **Idle**: пустая форма.
- **Ошибки валидации** (после первой отправки): «Укажите имя», «Укажите фамилию», «Укажите email» / «Некорректный email» (regex), «Пароль не короче 8 символов».
- **EMAIL_TAKEN** (`ApiError.code === 'EMAIL_TAKEN'`): под полем Email показывается «Email уже зарегистрирован» — независимо от `showErrors`; общий серверный блок при этом НЕ показывается.
- **Pending** (`reg.isPending`): кнопка disabled, «Создаём…».
- **Прочая серверная ошибка** (`isError && !emailTaken`): `ApiError` → его `message`; иначе «Не удалось зарегистрироваться. Попробуйте позже.».
- **Success**: уход в приложение через смену ветки `App`.

## Навигация

- «Войти» → `/login`.
- Успешная регистрация → приложение (`/`) через смену состояния `useClientMe` (не `navigate`). Новый аккаунт не привязан (`link === null`) → в `App` появляется `ConnectBanner`, доступен `/connect`.

## Бизнес-правила и edge-cases

- Минимальная длина пароля 8 — проверяется и на клиенте (`password.length < 8`), и на сервере (zod).
- `emailError` объединяет два источника: клиентскую ошибку формата (после `showErrors`) ИЛИ серверный `EMAIL_TAKEN` (всегда). Очищается при правке поля Email через `reg.reset()`.
- localStorage пишется в `try/catch` — приватный режим/нет доступа не ломает флоу.
- После регистрации аккаунт всегда без тренера: онбординг продолжается на `/connect` (или сразу самостоятельные тренировки).

## Сводка эндпоинтов

- `POST /api/client/auth/register` — регистрация; тело `{ email, password, firstName, lastName }` → 201 `{ account, token }` (+ cookie `client_session`).
- `GET /api/client/auth/me` — косвенно, через инвалидацию после успеха (определяет залогиненность и привязку).
