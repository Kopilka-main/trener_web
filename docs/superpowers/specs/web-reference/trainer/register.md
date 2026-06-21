# Регистрация тренера — RegisterPage.tsx

**Маршрут:** `/register` · **Точки входа:** ссылка «Регистрация» с `/login`
**Назначение:** создание аккаунта тренера (имя/фамилия/email/пароль) → cookie-сессия → главная.

## Макет (сверху вниз)

Центрированная колонка `max-w-[430px]`, `bg-bg`, `py-8`.

1. **Заголовок** «Регистрация» — `font-display`, 36px, `tracking-[-0.02em]`, цвет `accent-text`.
2. **Форма** (`noValidate`, `flex-col gap-4`):
   - **Field** «Имя» (`autoComplete=given-name`).
   - **Field** «Фамилия» (`autoComplete=family-name`).
   - **Field** «Email» (`type=email`, `autoComplete=email`).
   - **Field** «Пароль» (`type=password`, `autoComplete=new-password`).
   - **Серверная ошибка** (если есть, кроме «email занят»): `<p role="alert">` 14px `danger`.
   - **Button** submit: «Создать аккаунт» / при отправке «Создаём…».
3. **Низ:** «Уже есть аккаунт? **Войти**» — ссылка на `/login`.

## Данные

| Поле        | Источник                           | Формат |
| ----------- | ---------------------------------- | ------ |
| `firstName` | `useState`                         | строка |
| `lastName`  | `useState`                         | строка |
| `email`     | `useState`                         | строка |
| `password`  | `useState`                         | строка |
| статус      | `useRegister().isPending`          | bool   |
| ошибка      | `useRegister().error` (`ApiError`) | —      |

## Действия

- **Submit** → `handleSubmit`:
  1. Валидация; при ошибках → `setShowErrors(true)`, запрос не шлётся.
  2. `useRegister().mutate({ firstName.trim(), lastName.trim(), email.trim(), password })`.
  - **API:** `POST /api/auth/register`
    - тело: `{ email, password, firstName, lastName }` (`registerRequestSchema`: email lowercase+trim; password 8..200; имя/фамилия trim 1..100)
    - ответ 200: `{ trainer: TrainerResponse }` + cookie-сессия.
  - **onSuccess (мутации):** ставит `localStorage['push-prompt-pending']='1'` (предложить пуш позже), инвалидирует `['me']`. **onSuccess (страницы):** `navigate('/')`.
- **Тап «Войти»** → `/login`.

## Состояния

- **loading:** кнопка disabled, «Создаём…».
- **Ошибки валидации** (после первого submit):
  - имя пустое → «Укажите имя»; фамилия пустая → «Укажите фамилию».
  - email пустой → «Укажите email»; не по регэкспу → «Некорректный email».
  - пароль `< 8` символов → «Пароль не короче 8 символов».
- **Email занят:** `ApiError.code === 'EMAIL_TAKEN'` (409) → ошибка показывается **у поля email** текстом «Email уже зарегистрирован» (не как общий alert).
- **Прочая серверная ошибка** (не «занят»): `error.message` или «Не удалось зарегистрироваться. Попробуйте позже.».
- **success:** переход на `/`.

## Навигация

submit-успех → `/` · «Войти» → `/login`.

## Бизнес-правила и edge-cases

- `emailError` совмещает клиентскую ошибку email (по `showErrors`) и серверный `EMAIL_TAKEN` — `EMAIL_TAKEN` виден сразу после ответа, без повторного submit.
- Тримятся имя/фамилия/email; пароль не тримится.
- Регистрация сразу логинит (cookie в ответе), отдельного входа не требуется.
- `push-prompt-pending` потребляется компонентом PushPrompt после захода в приложение.

## Сводка эндпоинтов

- `POST /api/auth/register` — регистрация; `{email,password,firstName,lastName}` → `{trainer}` + cookie.
- (косвенно) `GET /api/auth/me` — гейт перечитывает тренера после успеха.
