# Вход тренера — LoginPage.tsx

**Маршрут:** `/login` · **Точки входа:** редирект гейта при отсутствии сессии; ссылка «Войти» с `/register`
**Назначение:** аутентификация тренера по email + пароль → cookie-сессия → переход на главную.

## Макет (сверху вниз)

Центрированная колонка `max-w-[430px]`, фон `bg-bg`, вертикальный центр экрана.

1. **Заголовок** «Вход» — `font-display`, 40px, `tracking-[-0.02em]`, цвет `accent-text`.
2. **Форма** (`noValidate`, `flex-col gap-4`):
   - **Field** «Email» (`type=email`, `autoComplete=email`).
   - **Field** «Пароль» (`type=password`, `autoComplete=current-password`).
   - **Серверная ошибка** (если есть): `<p role="alert">` 14px, цвет `danger`.
   - **Button** submit: «Войти» / при отправке «Входим…» (disabled во время запроса).
3. **Низ:** «Нет аккаунта? **Регистрация**» — ссылка на `/register` (`accent-text`).

## Данные

| Поле             | Источник                        | Формат |
| ---------------- | ------------------------------- | ------ |
| `email`          | локальный `useState`            | строка |
| `password`       | локальный `useState`            | строка |
| статус кнопки    | `useLogin().isPending`          | bool   |
| серверная ошибка | `useLogin().error` (`ApiError`) | текст  |

Никаких загружаемых данных при монтаже — экран только пишет.

## Действия

- **Submit формы** → `handleSubmit`:
  1. Клиентская валидация. Если есть ошибки → `setShowErrors(true)`, запрос НЕ шлётся.
  2. Иначе `useLogin().mutate({ email: email.trim(), password })`.
  - **API:** `POST /api/auth/login`
    - тело: `{ email: string, password: string }` (`loginRequestSchema`: email lowercase+trim, password 1..200)
    - ответ 200: `{ trainer: TrainerResponse }` + устанавливается cookie-сессия (`credentials: 'include'`)
  - **onSuccess (мутации):** инвалидация `['me']`; **onSuccess (страницы):** `navigate('/')`.
- **Тап «Регистрация»** → `/register`.

## Состояния

- **loading:** кнопка disabled, текст «Входим…».
- **Ошибки валидации** (только после первого submit, `showErrors`):
  - email пустой → «Укажите email»; не по регэкспу `^[^\s@]+@[^\s@]+\.[^\s@]+$` → «Некорректный email».
  - пароль пустой → «Укажите пароль».
- **Серверная ошибка:**
  - `ApiError.status === 401` → «Неверный email или пароль».
  - иной `ApiError` → `error.message` (сообщение сервера).
  - не-`ApiError` (сеть) → «Не удалось войти. Попробуйте позже.».
- **success:** переход на `/`.

## Навигация

submit-успех → `/` · «Регистрация» → `/register`.

## Бизнес-правила и edge-cases

- Валидация двухступенчатая: до первого submit ошибки полей скрыты (`showErrors=false`).
- `email.trim()` перед отправкой; пароль НЕ тримится.
- 401 маппится в дружелюбный текст, чтобы не раскрывать, что именно неверно.
- Сессия — серверная cookie (HttpOnly), токенов в ответе нет; клиент узнаёт о входе по `GET /auth/me`.

## Сводка эндпоинтов

- `POST /api/auth/login` — вход; `{email,password}` → `{trainer}` + cookie.
- (косвенно после успеха) `GET /api/auth/me` — гейт перечитывает текущего тренера.
